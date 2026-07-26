import { Router } from 'express'
import {
  postGenerate, getGenerationStatus, getGeneratedResults, patchGeneratedStatus,
} from '../controllers/generation.controller.js'

const router = Router()

router.post('/', postGenerate)
router.get('/results', getGeneratedResults)
router.get('/:jobId', getGenerationStatus)
router.patch('/results/:id', patchGeneratedStatus)

export default router
