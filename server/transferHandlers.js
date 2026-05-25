import { randomUUID } from "node:crypto"
import { getClientBySocketId } from "./deviceRegistry.js"
import {
  buildAcceptedPayload,
  closeTransferSession,
  createTransferSession,
  getTransferBySocketId,
  getTransferSession,
  removeTransferSession,
} from "./transferSessions.js"

/** @type {Map<string, { requestId: string, requesterSocketId: string, senderUsername: string, senderDeviceId: string, files: Array<{ name: string, size: number, type: string }> }>} */
const pendingByReceiver = new Map()

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
 * @returns {{ targetSocketId: string, senderUsername: string, senderDeviceId: string, files: Array<{ name: string, size: number, type: string }> } | null}
 */
function parseTransferRequestPayload(payload) {
  if (!payload || typeof payload !== "object") return null

  const {
    targetSocketId,
    senderUsername,
    senderDeviceId,
    files,
  } = payload

  if (
    typeof targetSocketId !== "string" ||
    typeof senderUsername !== "string" ||
    typeof senderDeviceId !== "string" ||
    !Array.isArray(files)
  ) {
    return null
  }

  const parsedFiles = files
    .filter(
      (f) =>
        f &&
        typeof f === "object" &&
        typeof f.name === "string" &&
        typeof f.size === "number" &&
        typeof f.type === "string"
    )
    .map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }))

  if (!targetSocketId.trim() || !senderUsername.trim() || !senderDeviceId.trim()) {
    return null
  }

  return {
    targetSocketId: targetSocketId.trim(),
    senderUsername: senderUsername.trim(),
    senderDeviceId: senderDeviceId.trim(),
    files: parsedFiles,
  }
}

/**
 * @param {string} requesterSocketId
 * @param {string} [reason]
 */
function rejectRequester(requesterSocketId, reason = "Request declined") {
  sendToSocket(requesterSocketId, {
    type: "transfer_request_rejected",
    payload: { requesterSocketId, reason },
  })
}

/**
 * @param {string} peerSocketId
 * @param {import('./transferSessions.js').TransferSession} session
 * @param {string} reason
 * @param {string} closedBySocketId
 */
function notifySessionClosed(peerSocketId, session, reason, closedBySocketId) {
  sendToSocket(peerSocketId, {
    type: "transfer_session_closed",
    payload: {
      transferId: session.transferId,
      reason,
      closedBySocketId,
      status: "cancelled",
    },
  })
}

/**
 * @param {import('./transferSessions.js').TransferSession} session
 * @param {string} disconnectedSocketId
 */
function closeSessionForDisconnect(session, disconnectedSocketId) {
  const peerSocketId =
    session.senderSocketId === disconnectedSocketId
      ? session.receiverSocketId
      : session.senderSocketId

  closeTransferSession(session.transferId, "cancelled")
  notifySessionClosed(
    peerSocketId,
    session,
    "Peer disconnected",
    disconnectedSocketId
  )
  removeTransferSession(session.transferId)
}

/**
 * @param {string} receiverSocketId
 */
export function clearReceiverPending(receiverSocketId) {
  pendingByReceiver.delete(receiverSocketId)
}

/**
 * @param {string} receiverSocketId
 */
export function getReceiverPending(receiverSocketId) {
  return pendingByReceiver.get(receiverSocketId)
}

/**
 * @param {string} requesterSocketId
 * @param {import('ws').WebSocket} ws
 * @param {unknown} payload
 */
export function handleTransferRequest(requesterSocketId, ws, payload) {
  const parsed = parseTransferRequestPayload(payload)
  if (!parsed) {
    rejectRequester(requesterSocketId, "Invalid request")
    return
  }

  const requester = getClientBySocketId(requesterSocketId)
  if (!requester || requester.mode !== "sender") {
    rejectRequester(requesterSocketId, "Sender not registered")
    return
  }

  const target = getClientBySocketId(parsed.targetSocketId)
  if (!target || target.mode !== "receiver") {
    rejectRequester(requesterSocketId, "Receiver unavailable")
    return
  }

  if (pendingByReceiver.has(parsed.targetSocketId)) {
    rejectRequester(requesterSocketId, "Receiver is busy")
    return
  }

  if (getTransferBySocketId(parsed.targetSocketId)) {
    rejectRequester(requesterSocketId, "Receiver is busy")
    return
  }

  const requestId = randomUUID()
  const totalSize = parsed.files.reduce((sum, f) => sum + f.size, 0)

  pendingByReceiver.set(parsed.targetSocketId, {
    requestId,
    requesterSocketId,
    senderUsername: parsed.senderUsername,
    senderDeviceId: parsed.senderDeviceId,
    files: parsed.files,
  })

  const relayed = sendToSocket(parsed.targetSocketId, {
    type: "incoming_transfer_request",
    payload: {
      requestId,
      requesterSocketId,
      senderUsername: parsed.senderUsername,
      senderDeviceId: parsed.senderDeviceId,
      files: parsed.files,
      fileCount: parsed.files.length,
      totalSize,
      timestamp: Date.now(),
    },
  })

  if (!relayed) {
    pendingByReceiver.delete(parsed.targetSocketId)
    rejectRequester(requesterSocketId, "Receiver unavailable")
    return
  }

  console.log(
    `[TRANSFER] Request ${requestId.slice(0, 8)}… from ${parsed.senderUsername} → ${target.username}`
  )
}

/**
 * @param {string} receiverSocketId
 * @param {unknown} payload
 */
export function handleTransferAccept(receiverSocketId, payload) {
  if (!payload || typeof payload !== "object") return

  const { requesterSocketId } = payload
  if (typeof requesterSocketId !== "string") return

  const pending = pendingByReceiver.get(receiverSocketId)
  if (!pending || pending.requesterSocketId !== requesterSocketId) return

  const receiver = getClientBySocketId(receiverSocketId)
  const requester = getClientBySocketId(requesterSocketId)
  if (!receiver || !requester) {
    clearReceiverPending(receiverSocketId)
    return
  }

  pendingByReceiver.delete(receiverSocketId)

  const totalBytes = pending.files.reduce((sum, f) => sum + f.size, 0)

  const session = createTransferSession({
    senderSocketId: requesterSocketId,
    receiverSocketId,
    senderDeviceId: pending.senderDeviceId || requester.deviceId || "",
    receiverDeviceId: receiver.deviceId || "",
    senderUsername: pending.senderUsername || requester.username || "Sender",
    receiverUsername: receiver.username || "Receiver",
    files: pending.files,
    totalBytes,
    status: "connecting",
  })

  const acceptedPayload = buildAcceptedPayload(session)

  sendToSocket(requesterSocketId, {
    type: "transfer_request_accepted",
    payload: acceptedPayload,
  })

  sendToSocket(receiverSocketId, {
    type: "transfer_request_accepted",
    payload: acceptedPayload,
  })

  console.log(`[TRANSFER] Session ${session.transferId.slice(0, 8)}… accepted`)
}

/**
 * @param {string} receiverSocketId
 * @param {unknown} payload
 */
export function handleTransferReject(receiverSocketId, payload) {
  if (!payload || typeof payload !== "object") return

  const { requesterSocketId } = payload
  if (typeof requesterSocketId !== "string") return

  const pending = pendingByReceiver.get(receiverSocketId)
  if (!pending || pending.requesterSocketId !== requesterSocketId) return

  pendingByReceiver.delete(receiverSocketId)
  rejectRequester(requesterSocketId, "Receiver declined")

  console.log(`[TRANSFER] Rejected ${pending.requestId.slice(0, 8)}…`)
}

/**
 * @param {string} requesterSocketId
 * @param {unknown} payload
 */
export function handleTransferCancel(requesterSocketId, payload) {
  if (!payload || typeof payload !== "object") return

  const { targetSocketId } = payload
  if (typeof targetSocketId !== "string") return

  const pending = pendingByReceiver.get(targetSocketId)
  if (!pending || pending.requesterSocketId !== requesterSocketId) return

  pendingByReceiver.delete(targetSocketId)

  sendToSocket(targetSocketId, {
    type: "transfer_request_cancelled",
    payload: { requesterSocketId },
  })

  console.log(`[TRANSFER] Cancelled request to ${targetSocketId.slice(0, 8)}…`)
}

/**
 * @param {string} socketId
 */
export function handleSocketDisconnectTransferCleanup(socketId) {
  const activeSession = getTransferBySocketId(socketId)
  if (activeSession) {
    closeSessionForDisconnect(activeSession, socketId)
  }

  const pendingAsReceiver = pendingByReceiver.get(socketId)
  if (pendingAsReceiver) {
    pendingByReceiver.delete(socketId)
    rejectRequester(
      pendingAsReceiver.requesterSocketId,
      "Receiver disconnected"
    )
    return
  }

  for (const [receiverSocketId, pending] of pendingByReceiver.entries()) {
    if (pending.requesterSocketId === socketId) {
      pendingByReceiver.delete(receiverSocketId)
      sendToSocket(receiverSocketId, {
        type: "transfer_request_cancelled",
        payload: { requesterSocketId: socketId },
      })
    }
  }
}
