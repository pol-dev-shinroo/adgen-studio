import { Router } from 'express'
import { postSegment, postRender } from '../controllers/aiGenerate.controller.js'

const router = Router()

router.post('/segment', postSegment)
router.post('/render', postRender)

export default router
