import { Router } from 'express'
import {
  postProductSync, getProductSyncStatus, getProducts, getProductStatus, deleteNamespace,
  postExtractProductImage, patchProductFields,
} from '../controllers/products.controller.js'

const router = Router()

router.post('/sync', postProductSync)
router.get('/sync/:jobId', getProductSyncStatus)
router.get('/status', getProductStatus)
router.delete('/:brand/pinecone', deleteNamespace)
router.post('/:brand/:productId/extract-image', postExtractProductImage)
router.patch('/:brand/:productId/fields', patchProductFields)
router.get('/', getProducts)

export default router
