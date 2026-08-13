import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadFromUrl, deleteAdMedia } from '../src/services/sheets/drive.service.js'

function stubFetch(handler) {
  const original = global.fetch
  global.fetch = handler
  return () => { global.fetch = original }
}

// A minimal stateful fake Drive client covering the folder-lookup/creation,
// file listing/creation, permissions, and trash-update calls
// uploadFromUrl/deleteAdMedia actually make.
function makeFakeDriveClient({ folders = {}, filesByFolder = {} } = {}) {
  const createdFiles = []
  const permissionCalls = []
  const trashedFileIds = []
  let nextFileId = 1

  return {
    createdFiles,
    permissionCalls,
    trashedFileIds,
    files: {
      list: async ({ q }) => {
        const folderNameMatch = q.match(/name = '([^']*)'/)
        if (folderNameMatch) {
          const id = folders[folderNameMatch[1]]
          return { data: { files: id ? [{ id }] : [] } }
        }
        // Listing files within a folder (either the keyword-folder
        // pre-scan or a name-contains lookup) — both read from
        // filesByFolder keyed by folder id.
        const folderIdMatch = q.match(/'([^']*)' in parents/)
        const folderId = folderIdMatch ? folderIdMatch[1] : null
        return { data: { files: filesByFolder[folderId] || [] } }
      },
      create: async ({ requestBody }) => {
        const id = `folder-or-file-${nextFileId++}`
        createdFiles.push({ id, ...requestBody })
        return { data: { id, webViewLink: `https://drive.google.com/file/d/${id}/view` } }
      },
      update: async ({ fileId }) => { trashedFileIds.push(fileId); return { data: {} } },
    },
    permissions: {
      create: async ({ fileId, requestBody }) => { permissionCalls.push({ fileId, requestBody }); return { data: {} } },
    },
  }
}

test('uploadFromUrl: a fresh URL is downloaded and uploaded as a new file, then made public', async () => {
  const fakeDrive = makeFakeDriveClient({ folders: { 'AdGen Media Archive': 'root-1', '테스트키워드': 'kw-1' } })
  const restore = stubFetch(async () => ({
    ok: true,
    headers: { get: () => 'image/jpeg' },
    body: new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('fake-bytes')); controller.close() },
    }),
  }))

  try {
    const result = await uploadFromUrl(
      'https://example.com/photo.jpg',
      { keyword: '테스트키워드', adArchiveId: '123', index: 0 },
      { getClientFn: () => fakeDrive }
    )

    assert.equal(result.reused, false)
    assert.match(result.link, /^https:\/\/drive\.google\.com\/file\/d\//)
    const uploaded = fakeDrive.createdFiles.find((f) => f.name === '123_0.jpg')
    assert.ok(uploaded, 'must be uploaded with the extension derived from content-type')
    assert.equal(fakeDrive.permissionCalls.length, 1)
    assert.equal(fakeDrive.permissionCalls[0].requestBody.type, 'anyone')
  } finally {
    restore()
  }
})

test('uploadFromUrl: a file already present in the keyword folder is reused, not re-downloaded', async () => {
  const fakeDrive = makeFakeDriveClient({
    folders: { 'AdGen Media Archive': 'root-1', '테스트키워드': 'kw-1' },
    filesByFolder: {
      'kw-1': [{ id: 'existing-file', name: '123_0.jpg', webViewLink: 'https://drive.google.com/file/d/existing-file/view' }],
    },
  })
  let fetchCalled = false
  const restore = stubFetch(async () => { fetchCalled = true; return { ok: true } })

  try {
    const result = await uploadFromUrl(
      'https://example.com/photo.jpg',
      { keyword: '테스트키워드', adArchiveId: '123', index: 0 },
      { getClientFn: () => fakeDrive }
    )
    assert.equal(result.reused, true)
    assert.equal(result.link, 'https://drive.google.com/file/d/existing-file/view')
    assert.equal(fetchCalled, false, 'a cached file must never be re-downloaded')
  } finally {
    restore()
  }
})

test('uploadFromUrl: a failed download throws rather than silently uploading nothing', async () => {
  const fakeDrive = makeFakeDriveClient({ folders: { 'AdGen Media Archive': 'root-1', 'x': 'kw-1' } })
  const restore = stubFetch(async () => ({ ok: false, status: 403 }))
  try {
    await assert.rejects(
      () => uploadFromUrl('https://example.com/dead.jpg', { keyword: 'x', adArchiveId: '9', index: 0 }, { getClientFn: () => fakeDrive }),
      /HTTP 403/
    )
  } finally {
    restore()
  }
})

test('deleteAdMedia: trashes every file matching the ad prefix and returns the real count', async () => {
  const fakeDrive = makeFakeDriveClient({
    folders: { 'AdGen Media Archive': 'root-1', '테스트키워드': 'kw-1' },
    filesByFolder: {
      'kw-1': [{ id: 'f1', name: '123_0.jpg' }, { id: 'f2', name: '123_thumb.jpg' }, { id: 'f3', name: '999_0.jpg' }],
    },
  })

  const trashed = await deleteAdMedia('테스트키워드', '123', { getClientFn: () => fakeDrive })

  assert.equal(trashed, 2, 'only the two files whose name actually starts with the ad prefix')
  assert.deepEqual(fakeDrive.trashedFileIds.sort(), ['f1', 'f2'])
})

test('deleteAdMedia: an ad with no media at all trashes nothing and returns 0', async () => {
  const fakeDrive = makeFakeDriveClient({
    folders: { 'AdGen Media Archive': 'root-1', '테스트키워드': 'kw-1' },
    filesByFolder: { 'kw-1': [] },
  })
  const trashed = await deleteAdMedia('테스트키워드', 'no-media-ad', { getClientFn: () => fakeDrive })
  assert.equal(trashed, 0)
})
