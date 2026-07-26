import { Readable } from 'node:stream'
import { google } from 'googleapis'
import { getAuthClient } from './google.client.js'
import { withRetry, googleIsRetryable } from '../utils/retry.js'

// Every Drive API call in this file goes through this so rate-limit/quota
// errors get retried with backoff, same pattern as drive.service.js.
function callDrive(fn) {
  return withRetry(fn, { isRetryable: googleIsRetryable })
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'
// Matches a Drive webViewLink's file ID (".../file/d/<id>/view") — same
// pattern adaptAd.js's toEmbeddableImageUrl uses to recognize a Drive link.
const DRIVE_FILE_ID_PATTERN = /\/file\/d\/([^/]+)/

let driveClient = null
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
    requestBody: { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) },
    fields: 'id',
  }))
  return created.data.id
}

const rootFolderIdByName = new Map() // rootFolderName -> Promise<id>
function getRootFolderId(rootFolderName) {
  if (!rootFolderIdByName.has(rootFolderName)) {
    rootFolderIdByName.set(rootFolderName, findOrCreateFolder(rootFolderName, null))
  }
  return rootFolderIdByName.get(rootFolderName)
}

const subfolderIdByKey = new Map() // `${rootFolderName}/${subfolder}` -> Promise<id>
function getSubfolderId(rootFolderName, subfolder) {
  const key = `${rootFolderName}/${subfolder}`
  if (!subfolderIdByKey.has(key)) {
    subfolderIdByKey.set(key, (async () => {
      const rootId = await getRootFolderId(rootFolderName)
      return findOrCreateFolder(subfolder, rootId)
    })())
  }
  return subfolderIdByKey.get(key)
}

async function downloadFromUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download failed (HTTP ${res.status}): ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType = (res.headers.get('content-type') || 'image/png').split(';')[0].trim()
  return { base64: buffer.toString('base64'), mimeType }
}

async function downloadFromDrive(fileId) {
  const drive = getClient()
  // Two calls (metadata for mimeType, alt:'media' for bytes) rather than
  // one — files.get with alt:'media' doesn't reliably surface content-type
  // through googleapis' response wrapper.
  const [metaRes, mediaRes] = await Promise.all([
    callDrive(() => drive.files.get({ fileId, fields: 'mimeType' })),
    callDrive(() => drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })),
  ])
  const buffer = Buffer.from(mediaRes.data)
  return { base64: buffer.toString('base64'), mimeType: metaRes.data.mimeType || 'image/png' }
}

// source: either a Drive webViewLink — downloaded via files.get(alt:'media')
// for the *original* bytes, not the public thumbnail endpoint (which is a
// lossy, resized rendition) — or a plain public URL (Cafe24 product
// photos, or this service's own previously-extracted/generated images),
// fetched directly. Both paths return { base64, mimeType }.
export async function downloadImageAsBase64(source) {
  const driveFileId = source.match(DRIVE_FILE_ID_PATTERN)?.[1]
  return driveFileId ? downloadFromDrive(driveFileId) : downloadFromUrl(source)
}

// Shared low-level upload: writes a base64 PNG to
// <rootFolderName>/<subfolder>/<fileName> (creating both folders if
// needed) and makes it "anyone with link can view", same convention as
// drive.service.js's uploadFromUrl. Generic over rootFolderName so both
// uploadGeneratedImage (below, "AdGen Generated Ads") and
// productImageExtraction.service.js's extraction upload (a different root,
// "AdGen Product References") share this exact mechanics instead of each
// hand-rolling their own — the two features genuinely need different root
// folders, but there's no reason the upload code itself should differ.
export async function uploadImage(base64Png, { rootFolderName, subfolder, fileName }) {
  const drive = getClient()
  const folderId = await getSubfolderId(rootFolderName, subfolder)
  const buffer = Buffer.from(base64Png, 'base64')

  const created = await callDrive(() => drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'image/png', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  }))

  // Retried on its own (no stream involved) — a silent failure here leaves
  // an uploaded-but-unshared file, indistinguishable from a broken link
  // from the frontend's point of view.
  await callDrive(() => drive.permissions.create({
    fileId: created.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  }))

  return created.data.webViewLink
}

export async function uploadGeneratedImage(base64Png, { brandKey, fileName }) {
  return uploadImage(base64Png, { rootFolderName: 'AdGen Generated Ads', subfolder: brandKey, fileName })
}
