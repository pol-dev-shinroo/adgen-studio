import { Router } from 'express'
import {
  postGenerate, getGenerationStatus, getGeneratedResults, getGeneratedResultFigmaExport, patchGeneratedStatus,
} from '../controllers/generation.controller.js'

const router = Router()

router.post('/', postGenerate)
router.get('/results', getGeneratedResults)
// CORS for this one route is opened up in app.js (fetched from inside a
// Figma plugin sandbox, not our own frontend) — the route itself doesn't
// need to know that; see app.js's FIGMA_EXPORT_PATH_RE.
router.get('/results/:id/figma-export', getGeneratedResultFigmaExport)
router.get('/:jobId', getGenerationStatus)
router.patch('/results/:id', patchGeneratedStatus)

export default router
