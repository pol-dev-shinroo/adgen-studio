import { MIGRATABLE_CREDENTIAL_KEYS } from '../config/index.js'
import { listCredentialStatus, setCredential } from '../services/credentials.service.js'
import { getUserById } from '../services/auth.service.js'

// Admin-only (requireAdmin runs before both of these in credentials.routes.js).
// Resolves each row's "Updated By User ID" to a real email for display —
// the vault itself only stores the ID, same normalization auth.controller.js
// already does for Created By elsewhere.
export async function getCredentials(req, res, next) {
  try {
    const statuses = await listCredentialStatus()
    const updaterIds = [...new Set(statuses.map((s) => s.updatedByUserId).filter(Boolean))]
    const updaters = await Promise.all(updaterIds.map((id) => getUserById(id)))
    const emailById = new Map(updaterIds.map((id, i) => [id, updaters[i]?.email || null]))

    res.json({
      credentials: statuses.map((s) => ({
        key: s.key,
        configured: s.configured,
        masked: s.masked,
        updatedAt: s.updatedAt,
        updatedByEmail: s.updatedByUserId ? emailById.get(s.updatedByUserId) : null,
      })),
    })
  } catch (err) {
    next(err)
  }
}

// Sets one credential's real value. Never echoes the plaintext back — the
// caller re-fetches GET /api/credentials to see the new masked value.
export async function putCredential(req, res, next) {
  try {
    const { key } = req.params
    if (!MIGRATABLE_CREDENTIAL_KEYS.includes(key)) {
      return res.status(400).json({ error: `알 수 없는 자격 증명 키입니다: ${key}` })
    }

    const { value } = req.body ?? {}
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: '값을 입력해주세요.' })
    }

    await setCredential(key, value.trim(), req.user.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
