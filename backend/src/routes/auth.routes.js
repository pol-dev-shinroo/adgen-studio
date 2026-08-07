import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAuth.js'
import {
  postLogin, postLogout, getMe, postCreateUser, getUsers,
} from '../controllers/auth.controller.js'

const router = Router()

// Public — the only route under /api/auth (or anywhere else) not gated by
// app.js's global requireAuth middleware. Every route below this one is
// already behind that gate by the time it's reached, so req.user is
// guaranteed set — only requireAdmin needs to run here, not requireAuth
// again.
router.post('/login', postLogin)

router.post('/logout', postLogout)
router.get('/me', getMe)
router.post('/users', requireAdmin, postCreateUser)
router.get('/users', requireAdmin, getUsers)

export default router
