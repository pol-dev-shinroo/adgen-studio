import { Router } from 'express'
import { getAds } from '../controllers/ads.controller.js'

const router = Router()

router.get('/', getAds)

export default router
