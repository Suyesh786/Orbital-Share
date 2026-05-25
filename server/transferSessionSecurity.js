import { getClientBySocketId } from "./deviceRegistry.js"
import {
  getTransferBySocketId,
  getTransferSession,
  touchTransferSessionActivity,
} from "./transferSessions.js"
import { isValidSessionTokenShape } from "./secureSessionTokens.js"

const IS_DEV = process.env.NODE_ENV !== "production"

/**
 * @param {string} code
 * @param {string} detail
 */
export function logSecurity(code, detail) {
  if (!IS_DEV) return
  console.log(`[SECURITY] ${code}: ${detail}`)
}

/**
 * @param {string} socketId
 * @returns {boolean}
 */
export function isSocketConnectionActive(socketId) {
  const client = getClientBySocketId(socketId)
  return Boolean(client && client.ws.readyState === 1)
}

/**
 * @typedef {'metadata' | 'chunk' | 'complete' | 'abort'} TransferSecureEventKind
 */

/**
 * Authoritative ownership + token + replay validation for transfer events.
 * @param {{ socketId: string, transferId: string, sessionToken?: string, role: 'sender' | 'receiver', eventKind: TransferSecureEventKind }} input
 * @returns {import('./transferSessions.js').TransferSession | undefined}
 */
export function validateSecureTransferEvent(input) {
  const { socketId, transferId, sessionToken, role, eventKind } = input

  if (!isSocketConnectionActive(socketId)) {
    logSecurity("stale_socket", `${eventKind} socket=${socketId.slice(0, 8)}`)
    return undefined
  }

  const session = getTransferSession(transferId)
  if (!session) {
    logSecurity("unknown_session", `${eventKind} ${transferId.slice(0, 8)}`)
    return undefined
  }

  if (eventKind === "abort") {
    if (!sessionToken || !isValidSessionTokenShape(sessionToken)) {
      logSecurity("token_rejected", "abort missing token")
      return undefined
    }
    if (session.sessionToken !== sessionToken) {
      logSecurity("token_rejected", `abort ${transferId.slice(0, 8)}`)
      return undefined
    }
    if (session.lifecycleCompleted) {
      logSecurity("replay_abort", transferId.slice(0, 8))
      return undefined
    }
    if (
      socketId !== session.senderSocketId &&
      socketId !== session.receiverSocketId
    ) {
      logSecurity("role_validation", `abort socket=${socketId.slice(0, 8)}`)
      return undefined
    }
    if (session.status === "cancelled" || session.status === "failed") {
      logSecurity("stale_session", `abort status=${session.status}`)
      return undefined
    }
    touchTransferSessionActivity(session.transferId)
    return session
  }

  const expectedSocket =
    role === "sender" ? session.senderSocketId : session.receiverSocketId

  if (expectedSocket !== socketId) {
    logSecurity(
      "role_validation",
      `${eventKind} socket=${socketId.slice(0, 8)} expected ${role}`
    )
    return undefined
  }

  if (eventKind !== "chunk") {
    if (!sessionToken || !isValidSessionTokenShape(sessionToken)) {
      logSecurity("token_rejected", `${eventKind} missing token`)
      return undefined
    }
    if (session.sessionToken !== sessionToken) {
      logSecurity("token_rejected", `${eventKind} ${transferId.slice(0, 8)}`)
      return undefined
    }
  }

  if (session.status === "cancelled" || session.status === "failed") {
    logSecurity("stale_session", `${eventKind} status=${session.status}`)
    return undefined
  }

  if (eventKind === "metadata") {
    if (session.metadataDelivered && session.status !== "connecting") {
      logSecurity("replay_metadata", transferId.slice(0, 8))
      return undefined
    }
    if (role !== "sender") {
      logSecurity("role_validation", "metadata requires sender")
      return undefined
    }
  }

  if (eventKind === "complete") {
    if (session.lifecycleCompleted) {
      logSecurity("replay_complete", transferId.slice(0, 8))
      return undefined
    }
    if (role !== "receiver") {
      logSecurity("role_validation", "complete requires receiver")
      return undefined
    }
    if (session.status !== "transferring") {
      logSecurity("invalid_complete", `status=${session.status}`)
      return undefined
    }
  }

  touchTransferSessionActivity(session.transferId)
  return session
}

/**
 * Binary chunks: socket-bound sender session (token not in wire format).
 * @param {string} senderSocketId
 * @returns {import('./transferSessions.js').TransferSession | undefined}
 */
export function validateSecureChunkSender(senderSocketId) {
  if (!isSocketConnectionActive(senderSocketId)) {
    logSecurity("stale_socket", `chunk sender=${senderSocketId.slice(0, 8)}`)
    return undefined
  }

  const session = getTransferBySocketId(senderSocketId)
  if (!session || session.senderSocketId !== senderSocketId) {
    logSecurity("invalid_chunk", `no session sender=${senderSocketId.slice(0, 8)}`)
    return undefined
  }

  if (session.lifecycleCompleted || session.status !== "transferring") {
    logSecurity(
      "invalid_chunk",
      `status=${session.status} transfer=${session.transferId.slice(0, 8)}`
    )
    return undefined
  }

  touchTransferSessionActivity(session.transferId)
  return session
}

/**
 * @param {string} socketId
 * @param {string} transferId
 * @param {string} [sessionToken]
 * @returns {import('./transferSessions.js').TransferSession | undefined}
 */
export function validateSecureTransferAbort(
  socketId,
  transferId,
  sessionToken
) {
  return validateSecureTransferEvent({
    socketId,
    transferId,
    sessionToken,
    role: "sender",
    eventKind: "abort",
  })
}
