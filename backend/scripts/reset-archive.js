// One-off admin script: wipes all rows from the target sheet tab and trashes
// (not permanently deletes — recoverable from Drive trash for 30 days) the
// entire "AdGen Media Archive" folder tree.
//
// After running this, restart the backend server process — drive.service.js
// caches the root/brand folder IDs in memory for the process lifetime, and a
// stale process would keep trying to upload into the now-trashed folder.
//
// Usage: node scripts/reset-archive.js

import { google } from 'googleapis'
import { config } from '../src/config/index.js'
import { getAuthClient } from '../src/services/google.client.js'

const ROOT_FOLDER_NAME = 'AdGen Media Archive'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

const auth = getAuthClient()
const sheets = google.sheets({ version: 'v4', auth })
const drive = google.drive({ version: 'v3', auth })

let sheetCleared = false
let folderTrashed = false
let trashedFolderId = null

try {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTabName}'!A:V`,
  })
  sheetCleared = true
  console.log(`Sheet cleared: tab "${config.sheetTabName}", range A:V (including header row).`)
} catch (err) {
  console.error('Failed to clear sheet:', err.message)
}

try {
  const found = await drive.files.list({
    q: `name = '${ROOT_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 10,
  })
  const folders = found.data.files || []

  if (folders.length === 0) {
    console.log(`No "${ROOT_FOLDER_NAME}" folder found — nothing to trash.`)
  } else {
    for (const folder of folders) {
      await drive.files.update({ fileId: folder.id, requestBody: { trashed: true } })
      console.log(`Trashed folder "${folder.name}" (id: ${folder.id}).`)
      trashedFolderId = folder.id
      folderTrashed = true
    }
    if (folders.length > 1) {
      console.warn(`Found and trashed ${folders.length} folders named "${ROOT_FOLDER_NAME}" — that's unexpected, double-check Drive trash.`)
    }
  }
} catch (err) {
  console.error('Failed to trash Drive folder:', err.message)
}

console.log('\n--- Summary ---')
console.log(`Sheet cleared: ${sheetCleared ? 'yes' : 'NO — see error above'}`)
console.log(`Folder trashed: ${folderTrashed ? `yes (id: ${trashedFolderId})` : 'no'}`)
console.log('\nRestart the backend server process now before running any new collection.')

if (!sheetCleared) process.exitCode = 1
