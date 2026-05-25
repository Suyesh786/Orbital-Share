import { getClientBySocketId } from "./deviceRegistry.js"
import {
  completeAndRemoveTransferSession,
  getTransferBySocketId,
  getTransferSession,
  updateTransferSession,
} from "./transferSessions.js"

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

  const { transferId, files, totalBytes } = payload
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
  if (!parsed) return

  const session = getTransferSession(parsed.transferId)
  if (!session || session.senderSocketId !== senderSocketId) return

  updateTransferSession(parsed.transferId, {
    status: "transferring",
    files: parsed.files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    })),
    totalBytes: parsed.totalBytes,
  })

  sendToSocket(session.receiverSocketId, {
    type: "transfer_metadata",
    payload: parsed,
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
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return
  if (buffer[0] !== CHUNK_MESSAGE_TYPE) return

  const session = getTransferBySocketId(senderSocketId)
  if (!session || session.senderSocketId !== senderSocketId) return

  const receiver = getClientBySocketId(session.receiverSocketId)
  if (!receiver || receiver.ws.readyState !== 1) return

  try {
    receiver.ws.send(buffer)
  } catch {
    /* ignore relay failure */
  }
}

/**
 * Receiver signals all chunks received — complete session for both peers.
 * @param {string} socketId
 * @param {unknown} payload
 */
export function handleTransferComplete(socketId, payload) {
  if (!payload || typeof payload !== "object") return

  const { transferId } = payload
  if (typeof transferId !== "string" || !transferId.trim()) return

  const session = getTransferSession(transferId.trim())
  if (!session) return

  if (socketId !== session.receiverSocketId) return

  const snapshot = completeAndRemoveTransferSession(transferId.trim())
  if (!snapshot) return

  const completedPayload = {
    transferId: snapshot.transferId,
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
