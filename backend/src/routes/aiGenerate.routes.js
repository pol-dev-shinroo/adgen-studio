import { Router } from 'express'
import { postSegment, postRender, postBackgroundImage } from '../controllers/aiGenerate.controller.js'

const router = Router()

router.post('/segment', postSegment)
router.post('/background-image', postBackgroundImage)
router.post('/render', postRender)

export default router
