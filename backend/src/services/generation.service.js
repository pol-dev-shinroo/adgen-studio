// Part Z: split into services/generation/{helpers,prepareInputs,run}.js by
// concern (pure helpers, input-prep orchestration, job execution — this
// was the largest file in backend at 425 lines mixing all three). This
// file stays a thin re-export so every existing import
// (generation.controller.js, generation.service.test.js) keeps working
// unchanged.
export { computeTotalRenders, counterFactsFromAdCopyOverride } from './generation/helpers.js'
export { prepareInputs } from './generation/prepareInputs.js'
export { startGeneration, getJob } from './generation/run.js'
