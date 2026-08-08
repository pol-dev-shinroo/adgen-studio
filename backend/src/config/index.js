// Part Z: this file used to hold all of config's logic directly (env
// loading/validation, brand derivation, credentials-vault plumbing) in one
// 227-line file. Split into env.js/brands.js/credentialsVault.js by
// concern; this file only re-exports, so no import path elsewhere in the
// codebase needs to change (`import { config } from '../config/index.js'`
// still works exactly as before).
//
// Import order matters here: env.js must load before credentialsVault.js.
// env.js needs MIGRATABLE_CREDENTIAL_KEYS from credentialsVault.js
// synchronously at its own top level (to seed resolvedEnv before building
// `config`); credentialsVault.js needs `config`/`resolvedEnv` back from
// env.js, but only inside function bodies, never at its own top level —
// see the comment in credentialsVault.js. That asymmetry is what makes
// this circular pair safe, but only if env.js is the one Node starts
// evaluating first. Do not reorder these two lines.
export * from './env.js'
export * from './credentialsVault.js'
export * from './brands.js'
