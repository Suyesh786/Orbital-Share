import { randomUUID } from "node:crypto"
import { generateSecureSessionToken } from "./secureSessionTokens.js"
import {
  canTransitionSessionStatus,
  logInvalidTransition,
} from "./transferSessionState.js"
import {
  clearSessionIdleTimeout,
  refreshSessionIdleTimeout,
} from "./transferSessionIdle.js"

/**
 * @typedef {'requesting' | 'connecting' | 'transferring' | 'completed' | 'cancelled' | 'failed'} TransferSessionStatus
 */

/**
 * @typedef {Object} TransferSession
 * @property {string} transferId
 * @property {string} senderSocketId
 * @property {string} receiverSocketId
 * @property {string} senderDeviceId
 * @property {string} receiverDeviceId
 * @property {string} senderUsername
 * @property {string} receiverUsername
 * @property {Array<{ name: string, size: number, type: string }>} files
 * @property {number} totalBytes
 * @property {TransferSessionStatus} status
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} sessionToken
 * @property {number} lastActivityAt
 * @property {boolean} metadataDelivered
 * @property {boolean} lifecycleCompleted
 */

/** @type {Map<string, TransferSession>} */
const sessionsById = new Map()

/** @type {Map<string, string>} socketId → transferId */
const transferIdBySocket = new Map()

/**
 * @param {Omit<TransferSession, 'transferId' | 'status' | 'createdAt' | 'updatedAt'> & { status?: TransferSessionStatus }} data
 * @returns {TransferSession}
 */
export function createTransferSession(data) {
  const transferId = randomUUID()
  const now = Date.now()

  /** @type {TransferSession} */
  const session = {
    transferId,
    senderSocketId: data.senderSocketId,
    receiverSocketId: data.receiverSocketId,
    senderDeviceId: data.senderDeviceId,
    receiverDeviceId: data.receiverDeviceId,
    senderUsername: data.senderUsername,
    receiverUsername: data.receiverUsername,
    files: data.files,
    totalBytes: data.totalBytes,
    status: data.status ?? "connecting",
    createdAt: now,
    updatedAt: now,
    sessionToken: generateSecureSessionToken(),
    lastActivityAt: now,
    metadataDelivered: false,
    lifecycleCompleted: false,
  }

  sessionsById.set(transferId, session)
  refreshSessionIdleTimeout(transferId)
  transferIdBySocket.set(session.senderSocketId, transferId)
  transferIdBySocket.set(session.receiverSocketId, transferId)

  console.log(`[SESSION] Created ${transferId.slice(0, 8)}… (${session.status})`)

  return session
}

/**
 * @param {string} transferId
 * @returns {TransferSession | undefined}
 */
export function getTransferSession(transferId) {
  return sessionsById.get(transferId)
}

/**
 * @param {string} transferId
 * @param {Partial<Pick<TransferSession, 'status' | 'files' | 'totalBytes'>>} patch
 * @returns {TransferSession | undefined}
 */
export function updateTransferSession(transferId, patch) {
  const session = sessionsById.get(transferId)
  if (!session) return undefined

  const updated = {
    ...session,
    ...patch,
    updatedAt: Date.now(),
  }

  sessionsById.set(transferId, updated)
  touchTransferSessionActivity(transferId)
  return updated
}

/**
 * @param {string} transferId
 */
export function touchTransferSessionActivity(transferId) {
  const session = sessionsById.get(transferId)
  if (!session) return
  session.lastActivityAt = Date.now()
  sessionsById.set(transferId, session)
  refreshSessionIdleTimeout(transferId)
}

/**
 * @param {string} transferId
 */
export function markSessionMetadataDelivered(transferId) {
  const session = sessionsById.get(transferId)
  if (!session) return
  session.metadataDelivered = true
  sessionsById.set(transferId, session)
}

/**
 * @param {string} transferId
 */
export function markSessionLifecycleCompleted(transferId) {
  const session = sessionsById.get(transferId)
  if (!session) return
  session.lifecycleCompleted = true
  sessionsById.set(transferId, session)
}

/**
 * Apply a validated status transition; returns undefined if invalid.
 * @param {string} transferId
 * @param {import('./transferSessionState.js').TransferSessionStatus} nextStatus
 * @param {string} [context]
 * @returns {TransferSession | undefined}
 */
export function transitionTransferSessionStatus(transferId, nextStatus, context = "") {
  const session = sessionsById.get(transferId)
  if (!session) return undefined

  if (session.status === nextStatus) {
    return session
  }

  if (!canTransitionSessionStatus(session.status, nextStatus)) {
    logInvalidTransition(session.status, nextStatus, context)
    return undefined
  }

  return updateTransferSession(transferId, { status: nextStatus })
}

/**
 * @param {string} transferId
 * @param {TransferSessionStatus} [finalStatus]
 * @returns {TransferSession | undefined}
 */
export function closeTransferSession(transferId, finalStatus = "cancelled") {
  const session = sessionsById.get(transferId)
  if (!session) return undefined

  const closed = {
    ...session,
    status: finalStatus,
    updatedAt: Date.now(),
  }

  sessionsById.set(transferId, closed)
  console.log(
    `[SESSION] Closed ${transferId.slice(0, 8)}… (${finalStatus})`
  )

  return closed
}

/**
 * @param {string} transferId
 */
export function removeTransferSession(transferId) {
  const session = sessionsById.get(transferId)
  if (!session) return

  sessionsById.delete(transferId)
  clearSessionIdleTimeout(transferId)

  const senderMapped = transferIdBySocket.get(session.senderSocketId)
  const receiverMapped = transferIdBySocket.get(session.receiverSocketId)

  if (senderMapped === transferId) {
    transferIdBySocket.delete(session.senderSocketId)
  }
  if (receiverMapped === transferId) {
    transferIdBySocket.delete(session.receiverSocketId)
  }

  console.log(`[SESSION] Cleanup ${transferId.slice(0, 8)}…`)
  console.log("[SESSION] Removed socket mappings")
  console.log("[SESSION] Receiver reusable again")
}

/**
 * Mark session completed, remove from registry, return final snapshot for broadcast.
 * @param {string} transferId
 * @returns {TransferSession | undefined}
 */
export function completeAndRemoveTransferSession(transferId) {
  const session = sessionsById.get(transferId)
  if (!session) return undefined

  console.log(`[SESSION] Completed ${transferId.slice(0, 8)}…`)

  closeTransferSession(transferId, "completed")
  removeTransferSession(transferId)

  return { ...session, status: "completed", updatedAt: Date.now() }
}

/**
 * @param {string} socketId
 * @returns {TransferSession | undefined}
 */
export function getTransferBySocketId(socketId) {
  const transferId = transferIdBySocket.get(socketId)
  if (!transferId) return undefined
  return sessionsById.get(transferId)
}

/**
 * @param {TransferSession} session
 * @returns {Record<string, unknown>}
 */
export function buildAcceptedPayload(session) {
  return {
    transferId: session.transferId,
    sessionToken: session.sessionToken,
    senderSocketId: session.senderSocketId,
    receiverSocketId: session.receiverSocketId,
    senderUsername: session.senderUsername,
    receiverUsername: session.receiverUsername,
    senderDeviceId: session.senderDeviceId,
    receiverDeviceId: session.receiverDeviceId,
    files: session.files,
    totalBytes: session.totalBytes,
    status: session.status,
  }
}

const ACTIVE_SESSION_STATUSES = new Set(["connecting", "transferring"])

/**
 * @returns {number}
 */
export function countActiveTransferSessions() {
  let count = 0
  for (const session of sessionsById.values()) {
    if (ACTIVE_SESSION_STATUSES.has(session.status)) {
      count += 1
    }
  }
  return count
}

/**
 * @param {string} deviceId
 * @returns {number}
 */
export function countActiveTransfersForDeviceId(deviceId) {
  let count = 0
  for (const session of sessionsById.values()) {
    if (!ACTIVE_SESSION_STATUSES.has(session.status)) continue
    if (
      session.senderDeviceId === deviceId ||
      session.receiverDeviceId === deviceId
    ) {
      count += 1
    }
  }
  return count
}

/**
 * @returns {string[]}
 */
export function listActiveTransferIds() {
  const ids = []
  for (const [transferId, session] of sessionsById.entries()) {
    if (ACTIVE_SESSION_STATUSES.has(session.status)) {
      ids.push(transferId)
    }
  }
  return ids
}
