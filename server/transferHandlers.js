import { randomUUID } from "node:crypto"
import { getClientByDeviceId, getClientBySocketId } from "./deviceRegistry.js"
import {
  logGuard,
  validateRegisteredSocket,
  isSocketInActiveTransfer,
} from "./transferEventGuards.js"
import {
  armPendingRequestTimeout,
  clearPendingRequestTimeout,
} from "./transferTimeouts.js"
import { validateOutboundFileList } from "./transferPayloadValidation.js"
import {
  registerSessionIdleExpireHandler,
} from "./transferSessionIdle.js"
import {
  logSecurity,
  validateSecureTransferAbort,
} from "./transferSessionSecurity.js"
import {
  buildAcceptedPayload,
  closeTransferSession,
  createTransferSession,
  getTransferBySocketId,
  getTransferSession,
  removeTransferSession,
} from "./transferSessions.js"
import { canAcceptNewTransfer } from "./transferCapacity.js"
import { getCapacityBusyMessage } from "./capacityGuard.js"

/**
 * @typedef {Object} PendingTransferRequest
 * @property {string} requestId
 * @property {string} requesterSocketId
 * @property {string} senderUsername
 * @property {string} senderDeviceId
 * @property {Array<{ name: string, size: number, type: string }>} files
 * @property {number} createdAt
 * @property {boolean} [accepting]
 */

/** @type {Map<string, PendingTransferRequest>} receiverSocketId → pending */
const pendingByReceiver = new Map()

/** @type {Map<string, string>} requesterSocketId → receiverSocketId */
const pendingByRequester = new Map()

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
 * @returns {{ targetSocketId: string, targetDeviceId: string, senderUsername: string, senderDeviceId: string, files: Array<{ name: string, size: number, type: string }> } | null}
 */
function parseTransferRequestPayload(payload) {
  if (!payload || typeof payload !== "object") return null

  const {
    targetSocketId,
    targetDeviceId,
    senderUsername,
    senderDeviceId,
    files,
  } = payload

  if (
    typeof senderUsername !== "string" ||
    typeof senderDeviceId !== "string" ||
    !Array.isArray(files)
  ) {
    return null
  }

  const normalizedTargetSocketId =
    typeof targetSocketId === "string" ? targetSocketId.trim() : ""
  const normalizedTargetDeviceId =
    typeof targetDeviceId === "string" ? targetDeviceId.trim() : ""

  if (
    (!normalizedTargetSocketId && !normalizedTargetDeviceId) ||
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

  if (
    !senderUsername.trim() ||
    !senderDeviceId.trim()
  ) {
    return null
  }

  return {
    targetSocketId: normalizedTargetSocketId,
    targetDeviceId: normalizedTargetDeviceId,
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
 * @param {string} receiverSocketId
 * @param {string} requesterSocketId
 * @param {string} [reason]
 */
function notifyReceiverRequestCancelled(
  receiverSocketId,
  requesterSocketId,
  reason = "Request cancelled"
) {
  sendToSocket(receiverSocketId, {
    type: "transfer_request_cancelled",
    payload: { requesterSocketId, reason },
  })
}

/**
 * @param {string} receiverSocketId
 * @param {string} [reason]
 */
function clearPendingForReceiver(receiverSocketId, reason = "cleanup") {
  const pending = pendingByReceiver.get(receiverSocketId)
  if (!pending) return

  pendingByReceiver.delete(receiverSocketId)
  pendingByRequester.delete(pending.requesterSocketId)
  clearPendingRequestTimeout(receiverSocketId)

  console.log(
    `[SESSION] Pending cleared receiver=${receiverSocketId.slice(0, 8)}… (${reason})`
  )
}

/**
 * @param {string} receiverSocketId
 */
function expirePendingRequest(receiverSocketId) {
  const pending = pendingByReceiver.get(receiverSocketId)
  if (!pending) return

  console.log(
    `[TIMEOUT] Request expired ${pending.requestId.slice(0, 8)}… receiver=${receiverSocketId.slice(0, 8)}…`
  )

  clearPendingForReceiver(receiverSocketId, "timeout")
  notifyReceiverRequestCancelled(
    receiverSocketId,
    pending.requesterSocketId,
    "Request timed out"
  )
  rejectRequester(pending.requesterSocketId, "Request timed out")
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
  console.log(
    `[SESSION] Cleanup disconnect ${session.transferId.slice(0, 8)}…`
  )
}

/**
 * @param {string} receiverSocketId
 */
export function clearReceiverPending(receiverSocketId) {
  clearPendingForReceiver(receiverSocketId, "explicit_clear")
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
    logGuard("invalid_payload", "transfer_request")
    rejectRequester(requesterSocketId, "Invalid request")
    return
  }

  const requesterCheck = validateRegisteredSocket(requesterSocketId, "sender")
  if (!requesterCheck.ok) {
    rejectRequester(requesterSocketId, "Sender not registered")
    return
  }

  if (isSocketInActiveTransfer(requesterSocketId)) {
    logGuard("duplicate_request", `requester ${requesterSocketId.slice(0, 8)} in session`)
    return
  }

  if (pendingByRequester.has(requesterSocketId)) {
    logGuard(
      "duplicate_request",
      `requester ${requesterSocketId.slice(0, 8)} already pending`
    )
    return
  }

  const target =
    (parsed.targetSocketId
      ? getClientBySocketId(parsed.targetSocketId)
      : undefined) ??
    (parsed.targetDeviceId
      ? getClientByDeviceId(parsed.targetDeviceId)
      : undefined)

  if (!target || target.mode !== "receiver") {
    rejectRequester(requesterSocketId, "Receiver unavailable")
    return
  }

  const resolvedTargetSocketId = target.socketId

  if (pendingByReceiver.has(resolvedTargetSocketId)) {
    logGuard("receiver_busy", resolvedTargetSocketId.slice(0, 8))
    rejectRequester(requesterSocketId, "Receiver is busy")
    return
  }

  if (isSocketInActiveTransfer(resolvedTargetSocketId)) {
    logGuard("receiver_busy", `session ${resolvedTargetSocketId.slice(0, 8)}`)
    rejectRequester(requesterSocketId, "Receiver is busy")
    return
  }

  const fileCheck = validateOutboundFileList(parsed.files)
  if (!fileCheck.valid) {
    logGuard("limit_exceeded", fileCheck.reason ?? "invalid files")
    rejectRequester(requesterSocketId, fileCheck.reason ?? "Transfer exceeds limits")
    return
  }

  if (!canAcceptNewTransfer(parsed.senderDeviceId)) {
    rejectRequester(requesterSocketId, getCapacityBusyMessage())
    return
  }

  const requestId = randomUUID()
  const totalSize = parsed.files.reduce((sum, f) => sum + f.size, 0)
  const now = Date.now()

  /** @type {PendingTransferRequest} */
  const pending = {
    requestId,
    requesterSocketId,
    senderUsername: parsed.senderUsername,
    senderDeviceId: parsed.senderDeviceId,
    files: parsed.files,
    createdAt: now,
  }

  pendingByReceiver.set(resolvedTargetSocketId, pending)
  pendingByRequester.set(requesterSocketId, resolvedTargetSocketId)

  armPendingRequestTimeout(resolvedTargetSocketId, () => {
    expirePendingRequest(resolvedTargetSocketId)
  })

  const relayed = sendToSocket(resolvedTargetSocketId, {
    type: "incoming_transfer_request",
    payload: {
      requestId,
      requesterSocketId,
      senderUsername: parsed.senderUsername,
      senderDeviceId: parsed.senderDeviceId,
      files: parsed.files,
      fileCount: parsed.files.length,
      totalSize,
      timestamp: now,
    },
  })

  if (!relayed) {
    clearPendingForReceiver(resolvedTargetSocketId, "relay_failed")
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
  if (typeof requesterSocketId !== "string") {
    logGuard("invalid_payload", "transfer_accept")
    return
  }

  const receiverCheck = validateRegisteredSocket(receiverSocketId, "receiver")
  if (!receiverCheck.ok) return

  const pending = pendingByReceiver.get(receiverSocketId)
  if (!pending || pending.requesterSocketId !== requesterSocketId) {
    logGuard("stale_accept", `receiver=${receiverSocketId.slice(0, 8)} no pending`)
    return
  }

  if (pending.accepting) {
    logGuard("duplicate_accept", `receiver=${receiverSocketId.slice(0, 8)}`)
    return
  }

  if (isSocketInActiveTransfer(receiverSocketId)) {
    logGuard("stale_accept", `receiver=${receiverSocketId.slice(0, 8)} in session`)
    clearPendingForReceiver(receiverSocketId, "receiver_busy")
    return
  }

  if (isSocketInActiveTransfer(requesterSocketId)) {
    logGuard("stale_accept", `requester=${requesterSocketId.slice(0, 8)} in session`)
    clearPendingForReceiver(receiverSocketId, "requester_busy")
    return
  }

  const requester = getClientBySocketId(requesterSocketId)
  if (!requester) {
    clearPendingForReceiver(receiverSocketId, "requester_offline")
    return
  }

  pending.accepting = true

  clearPendingRequestTimeout(receiverSocketId)
  pendingByReceiver.delete(receiverSocketId)
  pendingByRequester.delete(requesterSocketId)

  const receiver = receiverCheck.client
  const totalBytes = pending.files.reduce((sum, f) => sum + f.size, 0)

  if (
    !canAcceptNewTransfer(pending.senderDeviceId) ||
    !canAcceptNewTransfer(receiver.deviceId || "")
  ) {
    logGuard("capacity_limit", `accept blocked ${receiverSocketId.slice(0, 8)}`)
    rejectRequester(requesterSocketId, getCapacityBusyMessage())
    return
  }

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
  if (!pending || pending.requesterSocketId !== requesterSocketId) {
    logGuard("stale_reject", receiverSocketId.slice(0, 8))
    return
  }

  const requestId = pending.requestId
  clearPendingForReceiver(receiverSocketId, "rejected")
  rejectRequester(requesterSocketId, "Receiver declined")

  console.log(`[TRANSFER] Rejected ${requestId.slice(0, 8)}…`)
}

/**
 * @param {string} requesterSocketId
 * @param {unknown} payload
 */
export function handleTransferCancel(requesterSocketId, payload) {
  if (!payload || typeof payload !== "object") return

  const targetSocketId =
    typeof payload.targetSocketId === "string" ? payload.targetSocketId : ""
  const targetDeviceId =
    typeof payload.targetDeviceId === "string" ? payload.targetDeviceId : ""
  if (!targetSocketId && !targetDeviceId) return

  const resolvedTargetSocketId =
    targetSocketId ||
    getClientByDeviceId(targetDeviceId)?.socketId ||
    ""
  if (!resolvedTargetSocketId) return

  const mappedReceiver = pendingByRequester.get(requesterSocketId)
  if (mappedReceiver !== resolvedTargetSocketId) {
    logGuard("stale_cancel", requesterSocketId.slice(0, 8))
    return
  }

  const pending = pendingByReceiver.get(resolvedTargetSocketId)
  if (!pending || pending.requesterSocketId !== requesterSocketId) return

  clearPendingForReceiver(resolvedTargetSocketId, "cancelled")
  notifyReceiverRequestCancelled(resolvedTargetSocketId, requesterSocketId)

  console.log(
    `[TRANSFER] Cancelled request to ${resolvedTargetSocketId.slice(0, 8)}…`
  )
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
    clearPendingForReceiver(socketId, "receiver_disconnect")
    rejectRequester(
      pendingAsReceiver.requesterSocketId,
      "Receiver disconnected"
    )
    return
  }

  const receiverForRequester = pendingByRequester.get(socketId)
  if (receiverForRequester) {
    clearPendingForReceiver(receiverForRequester, "requester_disconnect")
    notifyReceiverRequestCancelled(
      receiverForRequester,
      socketId,
      "Sender disconnected"
    )
    return
  }

  for (const [receiverSocketId, pending] of pendingByReceiver.entries()) {
    if (pending.requesterSocketId === socketId) {
      clearPendingForReceiver(receiverSocketId, "requester_disconnect_scan")
      notifyReceiverRequestCancelled(
        receiverSocketId,
        socketId,
        "Sender disconnected"
      )
    }
  }
}

/**
 * Abort an active transfer session (mid-stream cancel).
 * @param {string} socketId
 * @param {unknown} payload
 */
export function handleTransferAbort(socketId, payload) {
  if (!payload || typeof payload !== "object") return

  const { transferId, sessionToken } = payload
  const resolvedId =
    typeof transferId === "string" && transferId.trim()
      ? transferId.trim()
      : getTransferBySocketId(socketId)?.transferId

  if (!resolvedId) {
    logSecurity("stale_abort", socketId.slice(0, 8))
    return
  }

  const session = validateSecureTransferAbort(
    socketId,
    resolvedId,
    typeof sessionToken === "string" ? sessionToken.trim() : ""
  )
  if (!session) return

  const peerSocketId =
    socketId === session.senderSocketId
      ? session.receiverSocketId
      : session.senderSocketId

  const reason =
    socketId === session.senderSocketId
      ? "Sender cancelled transfer"
      : "Receiver cancelled transfer"

  closeTransferSession(session.transferId, "cancelled")
  notifySessionClosed(peerSocketId, session, reason, socketId)
  removeTransferSession(session.transferId)

  console.log(
    `[TRANSFER] Aborted ${session.transferId.slice(0, 8)}… (${reason})`
  )
}

/**
 * @param {string} transferId
 */
function expireIdleTransferSession(transferId) {
  const session = getTransferSession(transferId)
  if (!session) return
  if (session.lifecycleCompleted) return

  logSecurity("session_idle", transferId.slice(0, 8))

  const notifySender = session.senderSocketId
  const notifyReceiver = session.receiverSocketId

  closeTransferSession(transferId, "cancelled")
  notifySessionClosed(
    notifySender,
    session,
    "Transfer session expired",
    notifySender
  )
  notifySessionClosed(
    notifyReceiver,
    session,
    "Transfer session expired",
    notifyReceiver
  )
  removeTransferSession(transferId)
}

registerSessionIdleExpireHandler(expireIdleTransferSession)
