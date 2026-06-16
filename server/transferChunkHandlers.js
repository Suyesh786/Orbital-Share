import { getClientBySocketId } from "./deviceRegistry.js"
import {
  isReasonableChunkPacket,
  validateTransferMetadataPayload,
} from "./transferPayloadValidation.js"
import {
  logSecurity,
  validateSecureChunkSender,
  validateSecureTransferEvent,
} from "./transferSessionSecurity.js"
import {
  completeAndRemoveTransferSession,
  markSessionLifecycleCompleted,
  markSessionMetadataDelivered,
  transitionTransferSessionStatus,
  updateTransferSession,
} from "./transferSessions.js"
import { allowChunkRelay } from "./chunkFloodProtection.js"

const CHUNK_MESSAGE_TYPE = 1

/**
 * @param {string} socketId
 * @param {Record<string, unknown>} message
 * @returns {boolean}
 */
function sendToSocket(socketId, message) {
  const client = getClientBySocketId(socketId)
  if (!client || client.ws.readyState !== 1) return false

  try {
    client.ws.send(JSON.stringify(message))
    return true
  } catch {
    return false
  }
}

/**
 * @param {unknown} payload
 */
function parseTransferMetadataPayload(payload) {
  if (!payload || typeof payload !== "object") return null

  const { transferId, sessionToken, files, totalBytes } = payload
  if (typeof transferId !== "string" || !Array.isArray(files)) return null

  const parsedFiles = files
    .filter(
      (f) =>
        f &&
        typeof f === "object" &&
        typeof f.fileId === "string" &&
        typeof f.name === "string" &&
        typeof f.size === "number" &&
        typeof f.type === "string"
    )
    .map((f) => ({
      fileId: f.fileId,
      name: f.name,
      size: f.size,
      type: f.type,
    }))

  if (!transferId.trim() || parsedFiles.length === 0) return null

  const bytes =
    typeof totalBytes === "number"
      ? totalBytes
      : parsedFiles.reduce((sum, f) => sum + f.size, 0)

  return {
    transferId: transferId.trim(),
    sessionToken:
      typeof sessionToken === "string" ? sessionToken.trim() : "",
    files: parsedFiles,
    totalBytes: bytes,
  }
}

/**
 * @param {string} senderSocketId
 * @param {unknown} payload
 */
export function handleTransferMetadata(senderSocketId, payload) {
  const parsed = parseTransferMetadataPayload(payload)
  if (!parsed) {
    logSecurity("invalid_payload", "transfer_metadata")
    return
  }

  const session = validateSecureTransferEvent({
    socketId: senderSocketId,
    transferId: parsed.transferId,
    sessionToken: parsed.sessionToken,
    role: "sender",
    eventKind: "metadata",
  })
  if (!session) return

  const metaCheck = validateTransferMetadataPayload(parsed)
  if (!metaCheck.valid) {
    logSecurity("invalid_metadata", metaCheck.reason ?? "validation failed")
    return
  }

  const transitioned = transitionTransferSessionStatus(
    parsed.transferId,
    "transferring",
    "metadata"
  )
  if (!transitioned) return

  updateTransferSession(parsed.transferId, {
    files: parsed.files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    })),
    totalBytes: parsed.totalBytes,
  })

  markSessionMetadataDelivered(parsed.transferId)

  sendToSocket(session.receiverSocketId, {
    type: "transfer_metadata",
    payload: {
      transferId: parsed.transferId,
      sessionToken: session.sessionToken,
      files: parsed.files,
      totalBytes: parsed.totalBytes,
    },
  })

  console.log(
    `[TRANSFER] Metadata ${parsed.transferId.slice(0, 8)}… (${parsed.files.length} files, ${parsed.totalBytes} bytes)`
  )
}

/**
 * Relay sender binary chunk frame to receiver unchanged.
 * @param {string} senderSocketId
 * @param {Buffer} buffer
 */
export function relayBinaryFileChunk(senderSocketId, buffer) {
  if (!isReasonableChunkPacket(buffer)) {
    logSecurity("invalid_chunk", `packet sender=${senderSocketId.slice(0, 8)}`)
    return
  }
  if (buffer[0] !== CHUNK_MESSAGE_TYPE) return

  if (!allowChunkRelay(senderSocketId, buffer)) {
    return
  }

  const session = validateSecureChunkSender(senderSocketId)
  if (!session) return

  const receiver = getClientBySocketId(session.receiverSocketId)
  if (!receiver || receiver.ws.readyState !== 1) return

  try {
    receiver.ws.send(buffer)
  } catch {
    logSecurity("chunk_relay_failed", session.transferId.slice(0, 8))
  }
}

/**
 * Receiver signals all chunks received — complete session for both peers.
 * @param {string} socketId
 * @param {unknown} payload
 */
export function handleTransferComplete(socketId, payload) {
  if (!payload || typeof payload !== "object") return

  const { transferId, sessionToken } = payload
  if (typeof transferId !== "string" || !transferId.trim()) {
    logSecurity("invalid_payload", "transfer_complete")
    return
  }

  const session = validateSecureTransferEvent({
    socketId,
    transferId: transferId.trim(),
    sessionToken:
      typeof sessionToken === "string" ? sessionToken.trim() : "",
    role: "receiver",
    eventKind: "complete",
  })
  if (!session) return

  markSessionLifecycleCompleted(transferId.trim())

  const snapshot = completeAndRemoveTransferSession(transferId.trim())
  if (!snapshot) return

  const completedPayload = {
    transferId: snapshot.transferId,
    sessionToken: snapshot.sessionToken,
    status: "completed",
  }

  sendToSocket(snapshot.senderSocketId, {
    type: "transfer_session_completed",
    payload: completedPayload,
  })

  sendToSocket(snapshot.receiverSocketId, {
    type: "transfer_session_completed",
    payload: completedPayload,
  })

  console.log(
    `[TRANSFER] Completed ${snapshot.transferId.slice(0, 8)}… (all chunks received)`
  )
}
