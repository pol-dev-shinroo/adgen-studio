import OpenAI from 'openai'
import { config } from '../config/index.js'
import { getAllAds, updateAdFields } from './sheets.service.js'
import { downloadImageAsBase64, uploadImage } from './imageIO.service.js'
import { extractGeneratedImageBase64 } from '../utils/gptImage.js'

let client = null
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

// Same orchestrator convention as productImageExtraction.service.js — the
// Responses API's hosted image_generation tool always renders/edits through
// OpenAI's current flagship image model (gpt-image-2 at time of writing)
// regardless of which mainline model orchestrates the call; gpt-5.5 is the
// one that actually works for this tool (gpt-4.1/gpt-4o-mini 403).
const ORCHESTRATOR_MODEL = 'gpt-5.5'

// Part N, deliberately NOT Part M's detect-then-isolate-per-entity shape:
// an ad creative can contain an unbounded number of distinct products/text
// phrases/logos/stickers, and firing one paid image_generation call per
// detected thing has no natural spending ceiling on a busy ad. This is
// capped at exactly ONE image_generation call, full stop — one prompt asks
// the model to both identify everything worth reusing AND compose all of
// it into a single output image (a "reference sheet"), never scaling with
// how many things are actually in the photo.
const REFERENCE_SHEET_PROMPT = `You are creating a single reference sheet from this advertisement image, for reuse in generating new ad creative.

Look at the entire image and identify everything worth reusing:
- Every DISTINCT product shown (ignore repeated instances/angles of the same product — count each genuinely different product once)
- The human model, if a person is visibly holding, using, or posing with the product(s)
- Every DISTINCT overlaid marketing text phrase, logo, or sticker/badge graphic (ignore any text printed on a product's own packaging — that stays attached to the product, not listed separately)

Compose ALL of these into ONE single output image: a clean reference sheet on a plain solid white background. Arrange each identified element as its own cleanly isolated cutout, spaced apart so nothing overlaps or touches. Preserve each element's exact appearance: true shape, colors, and proportions for products and the model; exact wording, font style, and colors for any text/logo/sticker element. Do not redraw, translate, restyle, or invent anything that wasn't in the original photo. Do not include the original photo's background, staging props, or any watermark. Do not add new shadows, reflections, or decorative borders.`

// Part O: a second, independent call from the same extraction action — text
// only, no image_generation tool, so it's cheap (same cost class as
// visionAnalysis.service.js's analyzeReferenceAd, which this is modeled
// on). Extracts reusable 가격/프로모션/광고후킹카피 candidates rather than
// visual elements. Runs alongside the reference-sheet call (Promise.all
// below), not instead of it — this action is still exactly one user click,
// at most 3 real API calls total (1 optional cheap detection some future
// revision might add + 1 image_generation + this 1 copy call), never
// scaling with how many phrases are actually in the ad.
const COPY_EXTRACTION_SYSTEM_PROMPT = `You are an expert Ad Copy Analyst. Inspect this advertisement image and extract reusable marketing copy candidates for a different brand's future ad.

Identify:
1. price: the exact price or price-like phrase shown in the ad (a specific 원 amount, a per-unit price, etc.), or null if the ad genuinely doesn't state one — many ads don't, that's expected, don't invent one.
2. promotion: the exact promotion/discount phrase shown (a percentage off, a 1+1 offer, a time-limited deal, etc.), or null if the ad doesn't state one.
3. adHooks: every distinct hook/USP-style marketing phrase worth reusing as ad copy elsewhere (headlines, claims, badge text) — exact wording as shown, one entry per genuinely distinct phrase, not a summary or rewrite.

Constraints (CRITICAL):
- Transcribe text exactly as it appears — do not paraphrase, translate, or invent anything not actually shown in the image.
- price and promotion must each be a single phrase or null, never an array.
- Output ONLY valid JSON matching this exact structure:

{
  "price": "string or null",
  "promotion": "string or null",
  "adHooks": ["string", ...]
}`

const COPY_EXTRACTION_USER_PROMPT = 'Analyze the provided advertisement image according to the system instructions. Output ONLY a valid JSON object.'

function findAdById(ads, adId) {
  return ads.find((a) => String(a['Ad Archive ID'] ?? '').trim() === String(adId).trim())
}

// Same fallback chain used elsewhere in this codebase for "the best image
// we actually have" for an ad row (Archived Image Links first — Drive-
// hosted, permanent — then Archived Thumbnail, then the raw, possibly-
// expired-by-now Image Links as a last resort).
function firstSourceImageUrl(ad) {
  const archived = (ad['Archived Image Links'] || '').split('\n').find(Boolean)
  if (archived) return archived
  const archivedThumb = (ad['Archived Thumbnail'] || '').trim()
  if (archivedThumb) return archivedThumb
  const raw = (ad['Image Links'] || '').split('\n').find(Boolean)
  if (raw) return raw
  return null
}

// Pure and exported so the shape-normalization logic (null-vs-string
// price/promotion, malformed adHooks entries) is unit-testable against
// fake JSON text without any real OpenAI call — same convention as
// productImageExtraction.service.js's parseDetectionResult.
export function parseAdCopyResult(rawText) {
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch (err) {
    throw new Error(`Ad copy extraction returned invalid JSON: ${err.message}`)
  }

  const price = typeof parsed.price === 'string' && parsed.price.trim() ? parsed.price.trim() : null
  const promotion = typeof parsed.promotion === 'string' && parsed.promotion.trim() ? parsed.promotion.trim() : null
  const adHooks = (Array.isArray(parsed.adHooks) ? parsed.adHooks : [])
    .filter((h) => typeof h === 'string' && h.trim())
    .map((h) => h.trim())

  return { price, promotion, adHooks }
}

async function extractReferenceSheet(base64, mimeType) {
  const response = await getClient().responses.create({
    model: ORCHESTRATOR_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: REFERENCE_SHEET_PROMPT },
          { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` },
        ],
      },
    ],
    tools: [{ type: 'image_generation', action: 'edit', background: 'opaque', quality: 'high' }],
  })
  return extractGeneratedImageBase64(response)
}

async function extractAdCopy(base64, mimeType) {
  const response = await getClient().responses.create({
    model: ORCHESTRATOR_MODEL,
    text: { format: { type: 'json_object' } },
    input: [
      { role: 'system', content: COPY_EXTRACTION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: COPY_EXTRACTION_USER_PROMPT },
          { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` },
        ],
      },
    ],
  })
  return parseAdCopyResult(response.output_text)
}

// Synchronous request/response, real money per call — one image_generation
// call (reference sheet) plus one cheap text-only call (copy candidates),
// run in parallel since they're independent, invoked on demand, never part
// of any batch/resync.
export async function extractAdReferenceImage(adId) {
  const ads = await getAllAds()
  const ad = findAdById(ads, adId)
  if (!ad) {
    const err = new Error(`No ad found for Ad Archive ID "${adId}"`)
    err.notFound = true
    throw err
  }

  const sourceImageUrl = firstSourceImageUrl(ad)
  if (!sourceImageUrl) {
    throw new Error(`Ad "${adId}" has no archived or raw image to extract a reference from.`)
  }

  const { base64, mimeType } = await downloadImageAsBase64(sourceImageUrl)

  const [resultBase64, copy] = await Promise.all([
    extractReferenceSheet(base64, mimeType),
    extractAdCopy(base64, mimeType),
  ])

  // Grouped by Search Keyword, not Brand — matches how drive.service.js
  // already organizes every other piece of this ad's media (the ad's
  // scraped "Brand" is really just the competitor's raw Page name, already
  // known to be an unreliable grouping axis — see drive.service.js's own
  // getKeywordFolder). Products use their own internal brandKey instead
  // because that concept doesn't exist for an arbitrary scraped ad.
  const subfolder = (ad['Search Keyword'] || '').trim() || 'unknown'
  const imageUrl = await uploadImage(resultBase64, {
    rootFolderName: 'AdGen Ad References',
    subfolder,
    fileName: `${adId}.png`,
  })

  const extractedAt = new Date().toISOString()
  await updateAdFields(String(adId), {
    'Extracted Reference JSON': JSON.stringify({ imageUrl, extractedAt }),
    'Extracted Copy JSON': JSON.stringify(copy),
  })

  return { imageUrl, extractedAt, ...copy }
}
