// Shared between productImageExtraction.service.js (product reference-photo
// extraction) and renderImage.service.js (final ad rendering) — both call
// the Responses API's hosted image_generation tool and need to pull the
// same base64 PNG out of the same output shape: find the
// image_generation_call item in the output array, then strip a
// "data:...;base64," prefix if the result happens to include one (most
// responses return bare base64, but this matches how both source n8n
// workflows' final Code nodes defensively handled either case).
export function extractGeneratedImageBase64(response) {
  const call = response.output?.find((item) => item.type === 'image_generation_call')
  if (!call?.result) {
    throw new Error('gpt-image-2 response did not include an image_generation_call result.')
  }
  const marker = 'base64,'
  const markerIndex = call.result.indexOf(marker)
  return markerIndex === -1 ? call.result : call.result.slice(markerIndex + marker.length)
}
