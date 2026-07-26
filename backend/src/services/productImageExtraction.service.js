import OpenAI from 'openai'
import { config } from '../config/index.js'
import { getAllProducts, updateProductField } from './productSheets.service.js'
import { downloadImageAsBase64, uploadImage } from './imageIO.service.js'
import { extractGeneratedImageBase64 } from '../utils/gptImage.js'

let client = null
function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey })
  }
  return client
}

// The Responses API's hosted image_generation tool always renders/edits
// through OpenAI's current flagship image model (gpt-image-2 at time of
// writing) regardless of which mainline model orchestrates the call.
// gpt-4.1 and gpt-4o-mini both hit a 403 here; gpt-5.5 (OpenAI's current
// flagship mainline model) is used instead per official docs.
const ORCHESTRATOR_MODEL = 'gpt-5.5'

// No tested n8n reference for this exact wording (product-photo cleanup was
// never automated there — every prior workflow assumed a clean reference
// photo already existed). May need real-world tuning once actual extraction
// results are visible.
const EXTRACTION_PROMPT = `Isolate ONLY the product from this photo. Remove the background, any hands, ` +
  `people, staging props, and marketing text overlays. Output the product centered on a plain solid white ` +
  `background, preserving its true shape, colors, proportions, and any text or label printed on the ` +
  `product's own packaging exactly as it appears. Do not crop off any part of the product, and do not add ` +
  `new shadows, reflections, or decorative elements.`

function findBrand(brandKey) {
  return config.brands.find((b) => b.key === brandKey)
}

// Synchronous request/response by design — a single gpt-image-2 edit call
// per product, invoked on demand from 상품관리, not a background job. Switch
// to a job/poll shape if this proves slow or timeout-prone in practice.
export async function extractProductImage(brandKey, productId) {
  const brand = findBrand(brandKey)
  if (!brand) {
    const err = new Error(`Unknown brand "${brandKey}"`)
    err.notFound = true
    throw err
  }

  const products = await getAllProducts()
  const product = products.find((p) => p['Brand'] === brand.name && p['Product ID'] === String(productId))
  if (!product) {
    const err = new Error(`No product "${productId}" found for brand "${brandKey}"`)
    err.notFound = true
    throw err
  }

  const rawImageUrl = (product['Image URL'] || '').split('\n')[0].trim()
  if (!rawImageUrl) {
    throw new Error(`Product "${productId}" has no raw image to extract a reference from.`)
  }

  const { base64, mimeType } = await downloadImageAsBase64(rawImageUrl)

  const response = await getClient().responses.create({
    model: ORCHESTRATOR_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: EXTRACTION_PROMPT },
          { type: 'input_image', image_url: `data:${mimeType};base64,${base64}` },
        ],
      },
    ],
    tools: [{ type: 'image_generation', action: 'edit', background: 'opaque', quality: 'high' }],
  })

  const resultBase64 = extractGeneratedImageBase64(response)

  const link = await uploadImage(resultBase64, {
    rootFolderName: 'AdGen Product References',
    subfolder: brandKey,
    fileName: `${productId}.png`,
  })

  const extractedAt = new Date().toISOString()
  await updateProductField(String(productId), 'Extracted Image URL', link)
  await updateProductField(String(productId), 'Extracted At', extractedAt)

  return { extractedImage: link, extractedAt }
}
