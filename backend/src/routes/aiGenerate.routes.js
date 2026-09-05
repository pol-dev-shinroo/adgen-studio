import { Router } from 'express'
import { postSegment, postRender, postBackgroundImage } from '../controllers/aiGenerate.controller.js'
import { getConversations, getConversationById, putConversation } from '../controllers/aiConversations.controller.js'

const router = Router()

router.post('/segment', postSegment)
router.post('/background-image', postBackgroundImage)
router.post('/render', postRender)

// Part SS: persisted 생성 AI conversation history.
router.get('/conversations', getConversations)
router.get('/conversations/:id', getConversationById)
router.put('/conversations/:id', putConversation)

export default router
