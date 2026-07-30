import { Router } from 'express'
import {
  postGenerate, getGenerationStatus, getGeneratedResults,
  getGeneratedResultFigmaExport, getGeneratedResultFigmaExportImage, patchGeneratedStatus,
} from '../controllers/generation.controller.js'

const router = Router()

router.post('/', postGenerate)
router.get('/results', getGeneratedResults)
// CORS for these two routes is opened up in app.js (fetched from inside a
// Figma plugin sandbox, not our own frontend) — the routes themselves don't
// need to know that; see app.js's CORS_OPEN_PATHS_RE.
router.get('/results/:id/figma-export', getGeneratedResultFigmaExport)
router.get('/results/:id/figma-export/image', getGeneratedResultFigmaExportImage)
router.get('/:jobId', getGenerationStatus)
router.patch('/results/:id', patchGeneratedStatus)

export default router
