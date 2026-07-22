import { google } from 'googleapis'
import { config } from '../config/index.js'

// Single OAuth2 client shared by the Sheets and Drive services.
// The refresh token must carry both the spreadsheets and drive.file scopes
// (scripts/google-auth.js requests them together).
let authClient = null

export function getAuthClient() {
  if (!authClient) {
    authClient = new google.auth.OAuth2(config.googleClientId, config.googleClientSecret)
    authClient.setCredentials({ refresh_token: config.googleRefreshToken })
  }
  return authClient
}
