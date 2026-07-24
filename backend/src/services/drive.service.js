import { Readable } from 'node:stream'
import { google } from 'googleapis'
import { config } from '../config/index.js'
import { getAuthClient } from './google.client.js'
import { withRetry, googleIsRetryable } from '../utils/retry.js'

// Every Drive API call in this file goes through this so rate-limit/quota
// errors (429, or 403 with a rateLimitExceeded reason) get retried with
// backoff instead of failing the whole collection job outright.
function callDrive(fn) {
  return withRetry(fn, { isRetryable: googleIsRetryable })
}

const ROOT_FOLDER_NAME = 'AdGen Media Archive'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DOWNLOAD_TIMEOUT_MS = 30_000

const EXT_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
}

let driveClient = null
let rootFolderIdPromise = null
const keywordFolderPromises = new Map() // search keyword → Promise<{ id, fileNames:Set }>

function getClient() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getAuthClient() })
  }
  return driveClient
}

function escapeQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findOrCreateFolder(name, parentId) {
  const drive = getClient()
  const parentClause = parentId ? ` and '${escapeQuery(parentId)}' in parents` : ''
  const found = await callDrive(() => drive.files.list({
    q: `name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false${parentClause}`,
    fields: 'files(id)',
    pageSize: 1,
  }))
  if (found.data.files?.length) return found.data.files[0].id

  const created = await callDrive(() => drive.files.create({
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  }))
  return created.data.id
}

function getRootFolderId() {
  if (!rootFolderIdPromise) {
    rootFolderIdPromise = config.driveFolderId
      ? Promise.resolve(config.driveFolderId)
      : findOrCreateFolder(ROOT_FOLDER_NAME, null)
  }
  return rootFolderIdPromise
}

// One subfolder per search keyword. Alongside the folder id we cache the
// names of the files already in it, so re-scrapes can skip existing uploads
// without one files.list call per candidate file.
//
// Note: grouping by keyword (not by the ad's actual Facebook Page name)
// means ads from different real advertisers that both matched the same
// search term land in the same folder — an accepted tradeoff, not a bug.
function getKeywordFolder(keyword) {
  const name = (keyword || '').trim() || '(unknown keyword)'
  if (!keywordFolderPromises.has(name)) {
    keywordFolderPromises.set(name, (async () => {
      const drive = getClient()
      const rootId = await getRootFolderId()
      const id = await findOrCreateFolder(name, rootId)

      const fileNames = new Set()
      let pageToken
      do {
        const res = await callDrive(() => drive.files.list({
          q: `'${escapeQuery(id)}' in parents and trashed = false`,
          fields: 'nextPageToken, files(name)',
          pageSize: 1000,
          pageToken,
        }))
        for (const f of res.data.files || []) fileNames.add(f.name)
        pageToken = res.data.nextPageToken
      } while (pageToken)

      return { id, fileNames }
    })())
  }
  return keywordFolderPromises.get(name)
}

async function findExistingByBaseName(folderId, baseName) {
  const drive = getClient()
  const res = await callDrive(() => drive.files.list({
    q: `'${escapeQuery(folderId)}' in parents and name contains '${escapeQuery(baseName)}.' and trashed = false`,
    fields: 'files(id, name, webViewLink)',
    pageSize: 10,
  }))
  const match = (res.data.files || []).find((f) => f.name.startsWith(`${baseName}.`))
  return match?.webViewLink ?? null
}

/**
 * Downloads a (fresh, still-signed) CDN URL and stores it permanently in
 * Drive under <root>/<keyword>/<adArchiveId>_<index>.<ext>. Returns the
 * file's webViewLink. If a file with that base name already exists in the
 * keyword folder, the existing link is returned and nothing is downloaded.
 */
export async function uploadFromUrl(fileUrl, { keyword, adArchiveId, index }) {
  const drive = getClient()
  const folder = await getKeywordFolder(keyword)
  const baseName = `${adArchiveId}_${index}`

  const cached = [...folder.fileNames].find((n) => n.startsWith(`${baseName}.`))
  if (cached) {
    const link = await findExistingByBaseName(folder.id, baseName)
    if (link) return { link, reused: true }
  }

  // The download + files.create are retried together (re-fetching the
  // source on every attempt) rather than files.create alone, because it
  // streams the response body directly — a stream can only be read once,
  // so retrying with a stale one would upload a truncated file.
  const created = await callDrive(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
      const res = await fetch(fileUrl, { signal: controller.signal })
      if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`)

      const contentType = (res.headers.get('content-type') || '').split(';')[0].trim()
      const ext = EXT_BY_CONTENT_TYPE[contentType]
        || (new URL(fileUrl).pathname.match(/\.(\w{2,4})$/)?.[1] ?? 'bin')
      const fileName = `${baseName}.${ext}`

      const result = await drive.files.create({
        requestBody: { name: fileName, parents: [folder.id] },
        media: {
          mimeType: contentType || 'application/octet-stream',
          body: Readable.fromWeb(res.body),
        },
        fields: 'id, webViewLink',
      })
      result.fileName = fileName
      return result
    } finally {
      clearTimeout(timer)
    }
  })

  // Retried on its own (no stream involved, always safe to repeat) —
  // matters because a silent failure here would leave the file uploaded
  // but not actually shareable, which looks exactly like a broken
  // thumbnail from the frontend's point of view even though the file
  // genuinely exists in Drive.
  await callDrive(() => drive.permissions.create({
    fileId: created.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  }))

  folder.fileNames.add(created.fileName)
  return { link: created.data.webViewLink, reused: false }
}
