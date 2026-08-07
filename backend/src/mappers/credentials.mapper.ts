// Maps one migrated credential to the "Credentials" sheet row. Pure module,
// same convention as user.mapper.ts/generatedAd.mapper.ts — no config/env
// imports, no encryption logic here (crypto.js/credentials.service.js own
// that), just row shape.

export interface CredentialRow {
  'Credential Key': string
  'Encrypted Value': string
  'Owner User ID': string
  'Updated At': string
  'Updated By User ID': string
}

export const CREDENTIAL_COLUMNS: (keyof CredentialRow)[] = [
  'Credential Key',
  'Encrypted Value',
  'Owner User ID',
  'Updated At',
  'Updated By User ID',
]

export interface MapCredentialInput {
  key: string
  encryptedValue: string
  ownerUserId: string
  updatedByUserId: string
  updatedAt?: string
}

export function mapCredential({
  key, encryptedValue, ownerUserId, updatedByUserId, updatedAt = new Date().toISOString(),
}: MapCredentialInput): CredentialRow {
  return {
    'Credential Key': key,
    'Encrypted Value': encryptedValue,
    'Owner User ID': ownerUserId,
    'Updated At': updatedAt,
    'Updated By User ID': updatedByUserId,
  }
}

export function toRow(mappedCredential: CredentialRow): string[] {
  return CREDENTIAL_COLUMNS.map((column) => mappedCredential[column] ?? '')
}
