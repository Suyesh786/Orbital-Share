import { randomBytes } from "node:crypto"

/**
 * Server-authoritative ephemeral session token (never client-generated).
 * @returns {string}
 */
export function generateSecureSessionToken() {
  return randomBytes(32).toString("base64url")
}

/**
 * @param {unknown} token
 * @returns {token is string}
 */
export function isValidSessionTokenShape(token) {
  return typeof token === "string" && token.length >= 32 && token.length <= 128
}
