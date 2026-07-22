import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const REQUIRED = ['APIFY_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'SHEET_ID']
const missing = REQUIRED.filter((name) => !process.env[name] || !process.env[name].trim())
if (missing.length) {
  throw new Error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
    'Copy backend/.env.example to backend/.env and fill them in ' +
    '(run scripts/google-auth.js to obtain GOOGLE_REFRESH_TOKEN).'
  )
}

export const config = {
  apifyToken: process.env.APIFY_TOKEN.trim(),
  googleClientId: process.env.GOOGLE_CLIENT_ID.trim(),
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN.trim(),
  sheetId: process.env.SHEET_ID.trim(),
  sheetTabName: (process.env.SHEET_TAB_NAME || '시트1').trim(),
  port: Number(process.env.PORT) || 4000,
}
