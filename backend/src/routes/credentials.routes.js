import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAuth.js'
import { getCredentials, putCredential } from '../controllers/credentials.controller.js'

const router = Router()

// Every route here is already behind app.js's global requireAuth gate, so
// req.user is guaranteed set — requireAdmin is the only extra check needed,
// same convention as auth.routes.js's /users routes.
router.get('/', requireAdmin, getCredentials)
router.put('/:key', requireAdmin, putCredential)

export default router
