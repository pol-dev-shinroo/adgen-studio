import { Router } from 'express'
import { getAds, patchAdField } from '../controllers/ads.controller.js'

const router = Router()

router.get('/', getAds)
router.patch('/:adArchiveId', patchAdField)

export default router
