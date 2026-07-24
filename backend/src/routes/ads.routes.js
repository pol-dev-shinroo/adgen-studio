import { Router } from 'express'
import { getAds, patchAdField, discardAds } from '../controllers/ads.controller.js'

const router = Router()

router.get('/', getAds)
router.post('/discard', discardAds)
router.patch('/:adArchiveId', patchAdField)

export default router
