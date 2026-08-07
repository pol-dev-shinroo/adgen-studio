// Maps one user account to the "Users" sheet row. Pure module, same
// convention as generatedAd.mapper.ts: no config/env imports, no bcrypt/JWT
// logic here — auth.service.js owns hashing/verification, this only shapes
// the plain row data.

export interface UserRow {
  'User ID': string
  'Email': string
  'Password Hash': string
  'Role': string
  'Created At': string
  'Created By': string
  'Last Login At': string
}

// Part X: every account created this part is 'admin' — a lower-privilege
// role is a real future need, not this part's job (see the task's own
// framing). Kept as a plain string column (not an enum) so a future role
// doesn't need a schema migration, only a new value.
export const USER_COLUMNS: (keyof UserRow)[] = [
  'User ID',
  'Email',
  'Password Hash',
  'Role',
  'Created At',
  'Created By',
  'Last Login At',
]

export interface MapUserInput {
  userId?: string
  email?: string
  passwordHash?: string
  role?: string
  createdAt?: string
  createdBy?: string
  lastLoginAt?: string
}

export function mapUser({
  userId, email, passwordHash, role = 'admin', createdAt = new Date().toISOString(), createdBy, lastLoginAt,
}: MapUserInput): UserRow {
  return {
    'User ID': userId ?? '',
    'Email': email ?? '',
    'Password Hash': passwordHash ?? '',
    'Role': role,
    'Created At': createdAt,
    // Blank for the bootstrap-created first account, which by definition
    // has no admin to attribute creation to yet.
    'Created By': createdBy ?? '',
    'Last Login At': lastLoginAt ?? '',
  }
}

export function toRow(mappedUser: UserRow): string[] {
  return USER_COLUMNS.map((column) => mappedUser[column] ?? '')
}

// Strips the password hash before this ever leaves auth.service.js —
// every public-facing user object (GET /me, the admin user list, the
// response from creating a new account) goes through this, never the raw
// row.
export function toSafeUser(row: Record<string, string>) {
  return {
    id: row['User ID'],
    email: row['Email'],
    role: row['Role'],
    createdAt: row['Created At'],
    createdBy: row['Created By'],
    lastLoginAt: row['Last Login At'] || null,
  }
}
