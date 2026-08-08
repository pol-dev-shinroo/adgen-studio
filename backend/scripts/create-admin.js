// One-time bootstrap: creates the very first admin account, bypassing the
// API/auth entirely (calls createUser directly), since no admin exists yet
// to authenticate as and this app deliberately has no public sign-up page.
// Every account after this one is created through the real UI (설정 →
// 사용자 관리), reachable only by an already-logged-in admin.
//
// Part Y: also does the credentials-vault migration in the same run — the
// client's own request was explicitly this combined flow. Reads every
// MIGRATABLE_CREDENTIAL_KEYS value straight out of backend/.env (already
// loaded into process.env by config/index.js) and writes each one present
// into the vault, owned by the admin just created. Only prints key names,
// never values. Safe to re-run: setCredential overwrites the row for a key
// that's already migrated rather than duplicating it.
//
// Usage (via tsx, not plain node — auth.service.js imports user.mapper.ts,
// which plain node's ESM loader can't resolve):
//   npx tsx scripts/create-admin.js <email> <password>

import { createUser } from '../src/services/auth/auth.service.js'
import { MIGRATABLE_CREDENTIAL_KEYS } from '../src/config/index.js'
import { setCredential } from '../src/services/auth/credentials.service.js'

const [, , email, password] = process.argv

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password>')
  process.exit(1)
}

try {
  const user = await createUser(email, password, null)
  console.log(`Admin account created: ${user.email} (User ID: ${user.id})`)
  console.log('Log in at the app\'s /login screen with this email and the password you just set.')

  console.log('\nMigrating credentials from backend/.env into the vault...')
  const migrated = []
  const skipped = []
  for (const key of MIGRATABLE_CREDENTIAL_KEYS) {
    const value = (process.env[key] || '').trim()
    if (!value) {
      skipped.push(key)
      continue
    }
    await setCredential(key, value, user.id)
    migrated.push(key)
  }

  console.log(`Migrated ${migrated.length} credential(s): ${migrated.join(', ') || '(none)'}`)
  if (skipped.length) {
    console.log(`Skipped (blank in .env): ${skipped.join(', ')}`)
  }
} catch (err) {
  console.error(`Failed to create admin account: ${err.message}`)
  process.exit(1)
}
