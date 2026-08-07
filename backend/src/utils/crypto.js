import crypto from 'node:crypto'

// AES-256-GCM: the encryption Part Y's own credentials vault is spec'd to
// use. GCM is authenticated (setAuthTag/getAuthTag below) — a tampered or
// truncated ciphertext fails to decrypt loudly instead of silently
// returning garbage. Never log a decrypted value anywhere, including in
// error messages — every throw below only ever names the credential key,
// never its value.
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // NIST-recommended length for GCM
const KEY_LENGTH = 32 // AES-256 needs a 32-byte key

function resolveKey(keyHex) {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `CREDENTIALS_ENCRYPTION_KEY must be a ${KEY_LENGTH * 2}-character hex string ` +
      `(${KEY_LENGTH} bytes) for AES-256-GCM.`
    )
  }
  return key
}

// Stored as one string: iv:authTag:ciphertext, each hex-encoded — fits in a
// single Sheets cell without any structured-value gymnastics.
export function encrypt(plaintext, keyHex) {
  const key = resolveKey(keyHex)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decrypt(encrypted, keyHex) {
  const key = resolveKey(keyHex)
  const parts = String(encrypted).split(':')
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted credential value (expected iv:authTag:ciphertext).')
  }
  const [ivHex, authTagHex, ciphertextHex] = parts
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()])
  return plaintext.toString('utf8')
}
