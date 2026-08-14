// Shared between StepGenerationOptions.jsx (생성 스튜디오) and the 생성 AI
// review step (AIStudioContext.jsx) — must stay in sync with the backend's
// FORMAT_SIZE keys (backend/src/utils/formatSize.js), since a string here
// that doesn't match falls through to that module's DEFAULT_SIZE silently.
export const FORMATS = ['1:1 피드', '4:5 피드', '9:16 스토리']
export const QUANTITIES = ['1장', '2장', '4장']
