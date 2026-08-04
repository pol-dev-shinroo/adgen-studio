import { Router } from 'express'
import { getAds, patchAdField, discardAds, postExtractAdReferenceImage } from '../controllers/ads.controller.js'

const router = Router()

router.get('/', getAds)
router.post('/discard', discardAds)
router.post('/:adArchiveId/extract-reference', postExtractAdReferenceImage)
router.patch('/:adArchiveId', patchAdField)

export default router
