// One-time helper: obtains a Google OAuth2 refresh token for the Sheets API.
//
// Usage:
//   1. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env
//      (OAuth client type "Web application" with authorized redirect URI
//      http://localhost:3001/oauth2callback)
//   2. node scripts/google-auth.js
//   3. Open the printed URL, sign in with the Google account that has edit
//      access to the target spreadsheet, and approve.
//   4. Paste the printed refresh token into backend/.env as GOOGLE_REFRESH_TOKEN.

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { google } from 'googleapis'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim()
const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env first.')
  process.exit(1)
}

const PORT = 3001
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

const consentUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force a refresh token even if previously approved
  scope: SCOPE,
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end()
    return
  }

  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`OAuth error: ${error || 'no code in callback'}`)
    console.error(`OAuth error: ${error || 'no code in callback'}`)
    server.close()
    process.exitCode = 1
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Done — you can close this tab and return to the terminal.')

    if (!tokens.refresh_token) {
      console.error(
        '\nGoogle did not return a refresh token (only an access token).\n' +
        'Revoke the app at https://myaccount.google.com/permissions and run this script again.'
      )
      process.exitCode = 1
    } else {
      console.log('\nSuccess! Add this line to backend/.env:\n')
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`)
      console.log('(Keep it secret — .env is gitignored.)')
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Token exchange failed — see terminal for details.')
    console.error('Token exchange failed:', err.message)
    process.exitCode = 1
  } finally {
    server.close()
  }
})

server.listen(PORT, () => {
  console.log('Temporary OAuth callback server listening on ' + REDIRECT_URI)
  console.log('\n1. Open this URL in your browser:')
  console.log('\n' + consentUrl + '\n')
  console.log('2. Sign in with the account that has EDIT access to the client spreadsheet.')
  console.log('3. Approve the Sheets permission; this window will finish automatically.')
})
