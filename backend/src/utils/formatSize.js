// gpt-image-2 accepts any size meeting its own constraints (max edge
// <=3840px, both edges multiples of 16px, aspect ratio <=3:1, 655,360-
// 8,294,400 total pixels) rather than a fixed enum — these three are exact
// matches for the app's three format options. Shared by renderImage
// .service.js (the actual render call) and generation.controller.js's
// figma-export endpoint (reports the size a given result was rendered at) —
// pulled out on its own so the two can never drift apart.
export const FORMAT_SIZE = {
  '1:1 피드': '1024x1024',
  '4:5 피드': '1024x1280',
  '9:16 스토리': '864x1536',
}

export const DEFAULT_SIZE = '1024x1024'

export function sizeForFormat(format) {
  return FORMAT_SIZE[format] || DEFAULT_SIZE
}
