import { getClientBySocketId } from "./deviceRegistry.js"
import {
  getTransferBySocketId,
  getTransferSession,
} from "./transferSessions.js"

/**
 * @param {string} code
 * @param {string} detail
 */
export function logGuard(code, detail) {
  console.log(`[GUARD] ${code}: ${detail}`)
}

/**
 * @param {string} socketId
 * @param {'sender' | 'receiver'} expectedMode
 * @returns {{ ok: true, client: NonNullable<ReturnType<typeof getClientBySocketId>> } | { ok: false }}
 */
export function validateRegisteredSocket(socketId, expectedMode) {
  const client = getClientBySocketId(socketId)
  if (!client) {
    logGuard("unregistered_socket", socketId.slice(0, 8))
    return { ok: false }
  }
  if (client.mode !== expectedMode) {
    logGuard("invalid_role", `${socketId.slice(0, 8)} mode=${client.mode}`)
    return { ok: false }
  }
  return { ok: true, client }
}

/**
 * @param {string} transferId
 * @param {string} socketId
 * @param {'sender' | 'receiver'} role
 * @returns {import('./transferSessions.js').TransferSession | undefined}
 */
export function validateSessionParticipant(transferId, socketId, role) {
  const session = getTransferSession(transferId)
  if (!session) {
    logGuard("unknown_session", transferId.slice(0, 8))
    return undefined
  }

  const expectedSocketId =
    role === "sender" ? session.senderSocketId : session.receiverSocketId

  if (expectedSocketId !== socketId) {
    logGuard(
      "socket_mismatch",
      `${role} ${socketId.slice(0, 8)} ≠ session ${expectedSocketId.slice(0, 8)}`
    )
    return undefined
  }

  return session
}

/**
 * @param {string} socketId
 * @returns {boolean}
 */
export function isSocketInActiveTransfer(socketId) {
  return Boolean(getTransferBySocketId(socketId))
}
