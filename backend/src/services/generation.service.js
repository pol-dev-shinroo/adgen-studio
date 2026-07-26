import { randomUUID } from 'node:crypto'
import { config } from '../config/index.js'
import { createJobStore } from '../utils/jobStore.js'
import { getAllAds } from './sheets.service.js'
import { getAllProducts } from './productSheets.service.js'
import { downloadImageAsBase64, uploadGeneratedImage } from './imageIO.service.js'
import { analyzeReferenceAd } from './visionAnalysis.service.js'
import { findCounterFacts } from './counterFacts.service.js'
import { writeReplacementCopy } from './copywriting.service.js'
import { renderFinalImage } from './renderImage.service.js'
import { appendGeneratedRow } from './generatedSheets.service.js'
import { mapGeneratedAd } from '../mappers/generatedAd.mapper.js'

const jobStore = createJobStore()
const RECENT_ITEMS_LIMIT = 20

function firstLink(newlineJoined) {
  return (newlineJoined || '').split('\n').find(Boolean) || ''
}

function findBrandDef(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

// Synchronous (well, awaited-but-fast) validation before any job/money is
// committed: unknown brand, unknown/unextracted product, or no matching
// reference ads all fail here with `.badRequest = true` rather than only
// surfacing after a job has already started (and, worse, after the
// expensive per-ad stages have already run).
async function prepareInputs({ refAdIds, brand }) {
  const brandDef = findBrandDef(brand?.key)
  if (!brandDef) {
    const err = new Error(`Unknown brand "${brand?.key}"`)
    err.badRequest = true
    throw err
  }

  const products = await getAllProducts()
  const product = products.find((p) => (
    p['Brand'] === brandDef.name && p['Product ID'] === String(brand.productId)
  ))
  if (!product) {
    const err = new Error(`No product "${brand.productId}" found for brand "${brand.key}"`)
    err.badRequest = true
    throw err
  }

  const extractedImageUrl = product['Extracted Image URL']
  if (!extractedImageUrl) {
    const err = new Error(
      '이 제품은 아직 참조 이미지가 추출되지 않았습니다 — 상품관리에서 먼저 추출해주세요.'
    )
    err.badRequest = true
    throw err
  }

  const allAds = await getAllAds()
  const adsById = new Map(allAds.map((a) => [String(a['Ad Archive ID']), a]))
  const refAds = (refAdIds || []).map((id) => adsById.get(String(id))).filter(Boolean)
  if (refAds.length === 0) {
    const err = new Error('선택한 레퍼런스 광고를 찾을 수 없습니다.')
    err.badRequest = true
    throw err
  }

  return { brandDef, extractedImageUrl, refAds }
}

// Input: { refBrand, refAdIds, brand:{key,productId}, formats, quantity,
// styleIntensity, instructions }. formats: array of format strings (see
// renderImage.service.js's FORMAT_SIZE keys). quantity: plain integer
// (frontend converts its '2장'-style chip value before calling this).
//
// Runs the expensive per-reference-ad stages (vision analysis, counter-fact
// research, copywriting) exactly once per selected reference ad and caches
// the result, then loops the render call once per (ad x format x quantity)
// combination — this is the single biggest cost lever in the whole
// pipeline, since those three LLM calls are identical for every render of
// the same ad regardless of format/quantity.
export async function startGeneration(input) {
  const { refBrand, refAdIds, brand, formats, quantity, styleIntensity, instructions } = input
  const { brandDef, extractedImageUrl, refAds } = await prepareInputs({ refAdIds, brand })

  const totalRenders = refAds.length * formats.length * quantity

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
    (job) => runJob(job, { refAds, extractedImageUrl, brandDef, formats, quantity, styleIntensity, instructions }),
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

async function runJob(job, { refAds, extractedImageUrl, brandDef, formats, quantity, styleIntensity, instructions }) {
  const progress = job.progress
  const summary = job.summary

  // Downloaded once, reused as productImageBase64 for every render in this
  // whole batch — it's the same product reference image regardless of
  // which reference ad or format is being rendered.
  const { base64: productImageBase64 } = await downloadImageAsBase64(extractedImageUrl)

  const perAdContext = []
  for (const ad of refAds) {
    const adId = ad['Ad Archive ID']
    const imageLink = firstLink(ad['Archived Image Links']) || ad['Archived Thumbnail'] || firstLink(ad['Image Links'])

    if (!imageLink) {
      summary.failed += formats.length * quantity
      summary.failures.push({ adId, error: 'No image available for this reference ad' })
      continue
    }

    try {
      progress.phase = 'analyzing'
      const { base64: referenceImageBase64 } = await downloadImageAsBase64(imageLink)
      const analysis = await analyzeReferenceAd(referenceImageBase64)

      progress.phase = 'researching'
      const { counter_facts } = await findCounterFacts(brandDef.key, analysis.identified_texts)

      progress.phase = 'writing'
      const { replacements } = await writeReplacementCopy(analysis.identified_texts, counter_facts)

      perAdContext.push({
        adId, referenceImageBase64, productInstances: analysis.product_instances, replacements,
      })
    } catch (err) {
      summary.failed += formats.length * quantity
      summary.failures.push({ adId, error: err.message })
      console.warn(`Reference-ad analysis failed (ad ${adId}): ${err.message}`)
    }
  }

  let renderIndex = 0
  for (const ctx of perAdContext) {
    for (const format of formats) {
      for (let i = 0; i < quantity; i++) {
        renderIndex += 1
        progress.phase = `rendering (${renderIndex}/${progress.totalRenders})`

        try {
          const resultBase64 = await renderFinalImage({
            referenceImageBase64: ctx.referenceImageBase64,
            productImageBase64,
            productInstances: ctx.productInstances,
            replacements: ctx.replacements,
            format,
            styleIntensity,
            instructions,
          })

          progress.phase = 'saving'
          const generationId = randomUUID()
          const imageUrl = await uploadGeneratedImage(resultBase64, {
            brandKey: brandDef.key,
            fileName: `${generationId}.png`,
          })

          await appendGeneratedRow(mapGeneratedAd({
            generationId,
            brand: brandDef.name,
            referenceAdId: ctx.adId,
            format,
            styleIntensity,
            instructions,
            imageUrl,
          }))

          summary.succeeded += 1
          summary.resultIds.push(generationId)
          progress.recentItems.unshift({ adId: ctx.adId, format, status: 'done', generationId })
        } catch (err) {
          summary.failed += 1
          summary.failures.push({ adId: ctx.adId, format, error: err.message })
          progress.recentItems.unshift({ adId: ctx.adId, format, status: 'failed' })
          console.warn(`Render failed (ad ${ctx.adId}, format ${format}): ${err.message}`)
        }

        progress.rendersDone = renderIndex
        progress.recentItems = progress.recentItems.slice(0, RECENT_ITEMS_LIMIT)
      }
    }
  }

  progress.phase = 'done'
  job.status = 'done'
  job.finishedAt = new Date().toISOString()
}
