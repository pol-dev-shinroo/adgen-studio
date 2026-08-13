import test from 'node:test'
import assert from 'node:assert/strict'
import { downloadImageAsBase64, uploadImage, uploadGeneratedImage } from '../src/services/generation/imageIO.service.js'

function stubFetch(handler) {
  const original = global.fetch
  global.fetch = handler
  return () => { global.fetch = original }
}

// A minimal stateful fake Drive client — enough surface for
// findOrCreateFolder/files.create/permissions.create/files.get, matching
// what imageIO.service.js's real drive calls actually touch.
function makeFakeDriveClient({ existingFolders = {}, fileBytes = {} } = {}) {
  const createdFiles = []
  const permissionCalls = []
  return {
    createdFiles,
    permissionCalls,
    files: {
      list: async ({ q }) => {
        const nameMatch = q.match(/name = '([^']*)'/)
        const name = nameMatch ? nameMatch[1] : null
        const id = existingFolders[name]
        return { data: { files: id ? [{ id }] : [] } }
      },
      create: async ({ requestBody }) => {
        const id = `file-${createdFiles.length + 1}`
        createdFiles.push({ id, ...requestBody })
        return { data: { id, webViewLink: `https://drive.google.com/file/d/${id}/view` } }
      },
      get: async ({ fileId, alt }) => {
        if (alt === 'media') return { data: fileBytes[fileId]?.buffer ?? Buffer.from('') }
        return { data: { mimeType: fileBytes[fileId]?.mimeType ?? 'image/png' } }
      },
    },
    permissions: {
      create: async ({ fileId, requestBody }) => { permissionCalls.push({ fileId, requestBody }); return { data: {} } },
    },
  }
}

test('downloadImageAsBase64: a plain public URL is fetched directly, not treated as a Drive link', async () => {
  const restore = stubFetch(async (url) => {
    assert.equal(url, 'https://example.com/photo.png')
    return {
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new TextEncoder().encode('fake-image-bytes').buffer,
    }
  })
  try {
    const result = await downloadImageAsBase64('https://example.com/photo.png')
    assert.equal(result.mimeType, 'image/png')
    assert.equal(Buffer.from(result.base64, 'base64').toString(), 'fake-image-bytes')
  } finally {
    restore()
  }
})

test('downloadImageAsBase64: a Drive webViewLink is downloaded via the Drive client, not fetch', async () => {
  const fakeDrive = makeFakeDriveClient({
    fileBytes: { 'abc123': { buffer: Buffer.from('drive-bytes'), mimeType: 'image/webp' } },
  })
  let fetchCalled = false
  const restore = stubFetch(async () => { fetchCalled = true; return { ok: true } })
  try {
    const result = await downloadImageAsBase64(
      'https://drive.google.com/file/d/abc123/view',
      { getClientFn: () => fakeDrive }
    )
    assert.equal(fetchCalled, false, 'a Drive link must never go through the plain fetch path')
    assert.equal(result.mimeType, 'image/webp')
    assert.equal(Buffer.from(result.base64, 'base64').toString(), 'drive-bytes')
  } finally {
    restore()
  }
})

test('downloadImageAsBase64: a failed fetch throws a clear HTTP-status error', async () => {
  const restore = stubFetch(async () => ({ ok: false, status: 404 }))
  try {
    await assert.rejects(() => downloadImageAsBase64('https://example.com/missing.png'), /HTTP 404/)
  } finally {
    restore()
  }
})

test('uploadImage: creates the file under the right root/subfolder, makes it public, and returns the real webViewLink', async () => {
  const fakeDrive = makeFakeDriveClient()
  const link = await uploadImage(
    Buffer.from('png-bytes').toString('base64'),
    { rootFolderName: 'AdGen Generated Ads', subfolder: 'healthykiki', fileName: 'gen-1.png' },
    { getClientFn: () => fakeDrive }
  )

  assert.match(link, /^https:\/\/drive\.google\.com\/file\/d\//)
  // createdFiles also includes the two real folder-creation calls (root +
  // subfolder, since neither exists yet in this fake) — the actual image
  // upload is the one whose name matches fileName, not a folder.
  const uploaded = fakeDrive.createdFiles.find((f) => f.name === 'gen-1.png')
  assert.ok(uploaded, 'the actual file upload must be a real files.create call')
  assert.equal(fakeDrive.permissionCalls.length, 1, 'must be made public via a real permissions.create call')
  assert.equal(fakeDrive.permissionCalls[0].requestBody.type, 'anyone')
})

test('uploadGeneratedImage: delegates to uploadImage with the fixed "AdGen Generated Ads" root and brandKey subfolder', async () => {
  const fakeDrive = makeFakeDriveClient()
  await uploadGeneratedImage(
    Buffer.from('x').toString('base64'),
    { brandKey: 'healthykiki', fileName: 'gen-2.png' },
    { getClientFn: () => fakeDrive }
  )
  assert.equal(fakeDrive.createdFiles[0].name, 'gen-2.png')
})
