import { Router } from 'express'
import { postCollect, getJobStatus } from '../controllers/collect.controller.js'

const router = Router()

router.post('/', postCollect)
router.get('/:jobId', getJobStatus)

export default router
