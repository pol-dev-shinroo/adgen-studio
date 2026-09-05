import { randomUUID } from 'node:crypto'
import { createJobStore } from '../../utils/jobStore.js'
import { downloadImageAsBase64, uploadGeneratedImage } from './imageIO.service.js'
import { analyzeReferenceAd } from './visionAnalysis.service.js'
import { findCounterFacts } from './counterFacts.service.js'
import { writeReplacementCopy } from './copywriting.service.js'
import { renderFinalImage } from './renderImage.service.js'
import { appendGeneratedRow } from '../sheets/generatedSheets.service.js'
import { mapGeneratedAd } from '../../mappers/generatedAd.mapper.js'
import { prepareInputs } from './prepareInputs.js'
import { computeTotalRenders, counterFactsFromAdCopyOverride, firstLink } from './helpers.js'

const jobStore = createJobStore()
const RECENT_ITEMS_LIMIT = 20

// Input: { refBrand, refAdConfigs, brand:{key,productIds}, styleIntensity,
// freeRestyle, strongReferenceInfluence, verbatimCopy, instructions,
// adCopyOverride, referenceSheetImageUrl, styleReferenceType }.
// Part LL: freeRestyle/strongReferenceInfluence/verbatimCopy are the 3
// independent booleans that now actually drive styleInstructionFor's/
// styleIntensityInstructionFor's branch selection — styleIntensity itself
// is threaded through unchanged too, but only for the generated-row sheet
// record; it plays no part in what gets rendered/written any more.
// Part DD: refAdConfigs replaces the old flat refAdIds/formats/quantity —
// each entry is { adId, formats: string[], quantity: number }, since the
// client's real need is per-reference-ad format/quantity (e.g. ad A -> 1
// image, ad B -> 2 images, possibly different formats), not one shared
// setting applied uniformly across every selected ad. formats: array of
// format strings (see renderImage.service.js's FORMAT_SIZE keys). quantity:
// plain integer (frontend converts its '2장'-style chip value before
// calling this). productIds: array — Step 3 allows selecting more than one
// of a brand's own products, each producing its own full render pass.
// referenceSheetImageUrl (Part Q): string | null — URL of one of our own
// brand's Part N/O composed reference sheets, used as a third, supplementary
// style-reference image in every render this job produces; null preserves
// the exact pre-Part-Q two-image render. styleReferenceType (Part DD):
// string | null — the extracted-reference `type` (e.g. 'model', 'badge')
// the referenceSheetImageUrl was sourced from, threaded through so
// renderImage.service.js can tell a model-face reference apart from a
// badge/logo one (see its own styleInstructionFor comment).
//
// Runs the expensive per-reference-ad stages (vision analysis, counter-fact
// research, copywriting) exactly once per selected reference ad and caches
// the result — that cache is keyed on the reference ad, not the product, so
// every selected product reuses it rather than re-paying for those three
// calls per product. Only the render step itself (and the one-time-per-
// product reference-image download) repeats per product.
//
// CC-1: deps lets a test inject fakes for every real external call
// (prepareInputs's own Sheets reads, image download/upload, vision/
// research/copywriting/render, the generated-row write) — same convention
// as prepareInputs.js's own getAllProductsFn/getAllAdsFn and
// productSync.service.js's startSync(brandKey, deps). Threaded through the
// jobStore.startJob closure to runJob for the same reason
// productSync.service.js's does: runJob is reached indirectly via a
// fire-and-forget callback, not awaited directly here.
export async function startGeneration(input, deps = {}) {
  const {
    refBrand, refAdConfigs, brand, styleIntensity, freeRestyle, strongReferenceInfluence, verbatimCopy,
    instructions, adCopyOverride, referenceSheetImageUrl, styleReferenceType,
  } = input
  const { prepareInputsFn = prepareInputs } = deps
  // prepareInputs only ever needs the plain ID list to fetch ad rows, never
  // per-ad config — refAdConfigs itself is kept for the render loop below.
  const refAdIds = refAdConfigs.map((c) => String(c.adId))
  const { brandDef, products, refAds } = await prepareInputsFn({ refAdIds, brand }, deps)

  const totalRenders = computeTotalRenders(products, refAdConfigs)

  return jobStore.startJob(
    {
      status: 'running',
      refBrand,
      brandKey: brandDef.key,
      brandName: brandDef.name,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      progress: {
        phase: 'analyzing',
        totalRenders,
        rendersDone: 0,
        recentItems: [],
      },
      summary: {
        totalRenders,
        succeeded: 0,
        failed: 0,
        failures: [],
        resultIds: [],
      },
    },
    (job) => runJob(
      job,
      {
        refAds, products, brandDef, refAdConfigs, styleIntensity, freeRestyle, strongReferenceInfluence,
        verbatimCopy, instructions, adCopyOverride, referenceSheetImageUrl, styleReferenceType, refBrand,
      },
      deps
    ),
    (job, err) => {
      job.status = 'failed'
      job.error = err.message
      job.finishedAt = new Date().toISOString()
    }
  )
}

export function getJob(jobId) {
  return jobStore.getJob(jobId)
}

// Part DD: looks up a reference ad's own formats/quantity config by adId —
// every perAdContext entry (and every refAds entry) originated from
// refAdConfigs in the first place, so a miss here should never really
// happen; treated as "0 renders" rather than throwing, so a hypothetical
// mismatch degrades to skipping that ad's renders instead of crashing the
// whole job.
function configFor(refAdConfigs, adId) {
  return refAdConfigs.find((c) => String(c.adId) === String(adId))
}

async function runJob(
  job,
  {
    refAds, products, brandDef, refAdConfigs, styleIntensity, freeRestyle, strongReferenceInfluence, verbatimCopy,
    instructions, adCopyOverride, referenceSheetImageUrl, styleReferenceType, refBrand,
  },
  {
    downloadImageAsBase64Fn = downloadImageAsBase64,
    analyzeReferenceAdFn = analyzeReferenceAd,
    findCounterFactsFn = findCounterFacts,
    writeReplacementCopyFn = writeReplacementCopy,
    renderFinalImageFn = renderFinalImage,
    uploadGeneratedImageFn = uploadGeneratedImage,
    appendGeneratedRowFn = appendGeneratedRow,
  } = {}
) {
  const progress = job.progress
  const summary = job.summary

  // Part P: resolved once per job, not per reference ad — same as the
  // Pinecone-backed facts it can replace, this has always been one shared
  // fact set applied uniformly across every selected reference ad, never
  // varied per ad.
  const overrideFacts = counterFactsFromAdCopyOverride(adCopyOverride)

  // Part Q: resolved once per job — an even broader scope than counter_facts
  // above, since this doesn't vary per product OR per reference ad either;
  // it's one shared supplementary style image for the whole run. A download
  // failure here is deliberately non-fatal — this image is a nice-to-have
  // enhancement, never load-bearing the way the product's own extracted
  // reference image is, so every render in the job just proceeds without a
  // third image rather than the whole job failing over an optional extra.
  let styleReferenceImageBase64 = null
  if (referenceSheetImageUrl) {
    try {
      styleReferenceImageBase64 = (await downloadImageAsBase64Fn(referenceSheetImageUrl)).base64
    } catch (err) {
      console.warn(`Style-reference sheet download failed, proceeding without it: ${err.message}`)
    }
  }

  // Built exactly once regardless of how many products are selected —
  // vision/counter-fact/copywriting analysis is keyed on the reference ad,
  // not the product.
  const perAdContext = []
  for (const ad of refAds) {
    const adId = ad['Ad Archive ID']
    const imageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || firstLink(ad['Image Links'])
    // Part DD: only this one ad's own config applies here — formats/
    // quantity are no longer a single shared value across every ad.
    const cfg = configFor(refAdConfigs, adId)

    if (!imageLink) {
      summary.failed += products.length * (cfg?.formats.length ?? 0) * (cfg?.quantity ?? 0)
      summary.failures.push({ adId, error: 'No image available for this reference ad' })
      continue
    }

    try {
      progress.phase = 'analyzing'
      const { base64: referenceImageBase64 } = await downloadImageAsBase64Fn(imageLink)
      const analysis = await analyzeReferenceAdFn(referenceImageBase64)

      progress.phase = 'researching'
      // Real, user-picked copy from Step 3's ad-selection panel skips the
      // Pinecone/embedding lookup entirely when present — not just a
      // different source of facts, a cheaper path too.
      const counter_facts = overrideFacts ?? (await findCounterFactsFn(brandDef.key, analysis.identified_texts)).counter_facts

      progress.phase = 'writing'
      // Part LL: verbatimCopy is the copy-side counterpart to
      // freeRestyle/strongReferenceInfluence below — same "competitor
      // original vs our own material" axis, applied to copy instead of image.
      const { replacements } = await writeReplacementCopyFn(analysis.identified_texts, counter_facts, verbatimCopy)

      perAdContext.push({
        adId, imageLink, referenceImageBase64, productInstances: analysis.product_instances, replacements,
      })
    } catch (err) {
      summary.failed += products.length * (cfg?.formats.length ?? 0) * (cfg?.quantity ?? 0)
      summary.failures.push({ adId, error: err.message })
      console.warn(`Reference-ad analysis failed (ad ${adId}): ${err.message}`)
    }
  }

  // Part DD: sums every already-built perAdContext entry's own config, same
  // math as computeTotalRenders — every ad still in perAdContext at this
  // point has a real refAdConfigs entry (the ones that didn't already got
  // filtered out/failed above).
  const totalRendersAcrossAds = perAdContext.reduce((sum, ctx) => {
    const c = configFor(refAdConfigs, ctx.adId)
    return sum + (c ? c.formats.length * c.quantity : 0)
  }, 0)

  let renderIndex = 0
  for (const productEntry of products) {
    // Downloaded once per product, reused across every (ad x format x
    // quantity) render for that product — not once per render.
    let productImageBase64
    try {
      const downloaded = await downloadImageAsBase64Fn(productEntry.extractedImageUrl)
      productImageBase64 = downloaded.base64
    } catch (err) {
      summary.failed += totalRendersAcrossAds
      summary.failures.push({
        productId: productEntry.productId,
        error: `Failed to download product reference image: ${err.message}`,
      })
      console.warn(`Product image download failed (product ${productEntry.productId}): ${err.message}`)
      continue
    }

    for (const ctx of perAdContext) {
      const cfg = configFor(refAdConfigs, ctx.adId)
      if (!cfg) continue // shouldn't happen — every perAdContext entry originated from refAdConfigs
      for (const format of cfg.formats) {
        for (let i = 0; i < cfg.quantity; i++) {
          renderIndex += 1
          progress.phase = `rendering (${renderIndex}/${progress.totalRenders})`

          try {
            const resultBase64 = await renderFinalImageFn({
              referenceImageBase64: ctx.referenceImageBase64,
              productImageBase64,
              styleReferenceImageBase64,
              styleReferenceType,
              productInstances: ctx.productInstances,
              replacements: ctx.replacements,
              format,
              freeRestyle,
              strongReferenceInfluence,
              instructions,
            })

            progress.phase = 'saving'
            const generationId = randomUUID()
            const imageUrl = await uploadGeneratedImageFn(resultBase64, {
              brandKey: brandDef.key,
              fileName: `${generationId}.png`,
            })

            await appendGeneratedRowFn(mapGeneratedAd({
              generationId,
              brand: brandDef.name,
              // Part DD: the competitor brand this render referenced —
              // already known at the job level (job.refBrand), just never
              // threaded down into the per-render row before now.
              refBrand,
              referenceAdId: ctx.adId,
              format,
              styleIntensity,
              instructions,
              imageUrl,
              productId: productEntry.productId,
              replacements: ctx.replacements,
              // Part V: snapshotted at generation time, for the Gallery's
              // redesigned 비교 view — nothing to look up live for these.
              referenceAdImageUrl: ctx.imageLink,
              productReferenceImageUrl: productEntry.extractedImageUrl,
              styleReferenceImageUrl: referenceSheetImageUrl || '',
            }))

            summary.succeeded += 1
            summary.resultIds.push(generationId)
            progress.recentItems.unshift({
              adId: ctx.adId, format, productId: productEntry.productId, status: 'done', generationId,
            })
          } catch (err) {
            summary.failed += 1
            summary.failures.push({
              adId: ctx.adId, format, productId: productEntry.productId, error: err.message,
            })
            progress.recentItems.unshift({
              adId: ctx.adId, format, productId: productEntry.productId, status: 'failed',
            })
            console.warn(
              `Render failed (ad ${ctx.adId}, format ${format}, product ${productEntry.productId}): ${err.message}`
            )
          }

          progress.rendersDone = renderIndex
          progress.recentItems = progress.recentItems.slice(0, RECENT_ITEMS_LIMIT)
        }
      }
    }
  }

  progress.phase = 'done'
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
