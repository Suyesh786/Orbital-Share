import { randomUUID } from "node:crypto"
import {
  broadcastReceiversUpdated,
  buildReceiversListFor,
} from "./discovery.js"
import {
  addSocket,
  getClientBySocketId,
  getClientCount,
  getReceivers,
  registerClient,
  unregisterClient,
} from "./deviceRegistry.js"
import {
  handleSocketDisconnectTransferCleanup,
  handleTransferAccept,
  handleTransferAbort,
  handleTransferCancel,
  handleTransferReject,
  handleTransferRequest,
} from "./transferHandlers.js"
import {
  handleTransferComplete,
  handleTransferMetadata,
  relayBinaryFileChunk,
} from "./transferChunkHandlers.js"
import { evaluateConnectionCapacity, getCapacityBusyMessage, isServerSoftBusy } from "./capacityGuard.js"
import { allowRate, clearRateLimitsForSocket } from "./rateLimiter.js"
import { clearChunkFloodState } from "./chunkFloodProtection.js"
import { parseValidatedMessage } from "./wsMessageValidation.js"
import { logProduction } from "./productionLog.js"

const RATE_LIMITED_TYPES = new Set([
  "register",
  "discover_receivers",
  "transfer_request",
  "transfer_accept",
  "transfer_reject",
  "transfer_cancel",
  "transfer_abort",
  "transfer_metadata",
  "transfer_complete",
])

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} code
 * @param {string} message
 */
function sendServerNotice(ws, code, message) {
  if (ws.readyState !== 1) return
  try {
    ws.send(
      JSON.stringify({
        type: "server_notice",
        payload: { code, message },
      })
    )
  } catch {
    // ignore send failures
  }
}

/**
 * @param {string} socketId
 * @param {import('ws').WebSocket} ws
 * @param {unknown} payload
 */
function handleRegister(socketId, ws, payload) {
  if (!payload || typeof payload !== "object") return

  const { username, deviceId, mode, deviceType, platform } = payload
  if (
    typeof username !== "string" ||
    typeof deviceId !== "string" ||
    (mode !== "sender" && mode !== "receiver")
  ) {
    return
  }

  const trimmedUsername = username.trim()
  if (!trimmedUsername || !deviceId.trim()) return

  const registered = registerClient(socketId, {
    username: trimmedUsername,
    deviceId: deviceId.trim(),
    mode,
    deviceType,
    platform,
  })

  if (!registered) return

  console.log(
    `[REGISTER] socket=${socketId.slice(0, 8)}… mode=${mode} username=${trimmedUsername}`
  )

  ws.send(
    JSON.stringify({
      type: "registered",
      payload: {
        socketId,
        deviceId: deviceId.trim(),
        username: trimmedUsername,
        mode,
        deviceType:
          deviceType === "desktop" ||
          deviceType === "mobile" ||
          deviceType === "unknown"
            ? deviceType
            : "unknown",
        platform:
          platform === "macos" ||
          platform === "windows" ||
          platform === "linux" ||
          platform === "android" ||
          platform === "ios" ||
          platform === "unknown"
            ? platform
            : "unknown",
      },
    })
  )

  if (isServerSoftBusy()) {
    sendServerNotice(ws, "capacity_busy", getCapacityBusyMessage())
  }

  broadcastReceiversUpdated()
}

/**
 * @param {string} socketId
 * @param {import('ws').WebSocket} ws
 */
function handleDiscoverReceivers(socketId, ws) {
  if (isServerSoftBusy()) {
    sendServerNotice(ws, "capacity_busy", getCapacityBusyMessage())
  }

  const receivers = buildReceiversListFor(socketId)
  const registrySnapshot = getReceivers().map((client) => ({
    socketId: client.socketId.slice(0, 8),
    mode: client.mode,
    username: client.username,
  }))

  console.log(
    `[DISCOVERY] discover_receivers requester=${socketId.slice(0, 8)}… isBinary=false`
  )
  console.log(
    `[DISCOVERY] registry receivers=${registrySnapshot.length}`,
    registrySnapshot
  )
  console.log(`[DISCOVERY] Returning ${receivers.length} receivers`)

  ws.send(
    JSON.stringify({
      type: "receivers_list",
      payload: receivers,
    })
  )
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {{ softBusy?: boolean }} [options]
 */
export function registerSocketHandlers(ws, options = {}) {
  const socketId = randomUUID()
  addSocket(socketId, ws)

  console.log("[WS] Client connected")
  console.log(`[WS] Total clients: ${getClientCount()}`)

  ws.send(
    JSON.stringify({
      type: "connected",
      socketId,
      timestamp: Date.now(),
    })
  )

  if (options.softBusy) {
    sendServerNotice(ws, "capacity_busy", getCapacityBusyMessage())
  }

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
      relayBinaryFileChunk(socketId, buffer)
      return
    }

    const message = parseValidatedMessage(raw)
    if (!message) {
      return
    }

    if (RATE_LIMITED_TYPES.has(message.type)) {
      if (!allowRate(socketId, message.type)) {
        return
      }
    }

    console.log(
      `[WS] message type=${message.type} isBinary=${isBinary} socket=${socketId.slice(0, 8)}…`
    )

    switch (message.type) {
      case "register":
        handleRegister(socketId, ws, message.payload)
        break
      case "discover_receivers":
        handleDiscoverReceivers(socketId, ws)
        break
      case "transfer_request":
        handleTransferRequest(socketId, ws, message.payload)
        break
      case "transfer_accept":
        handleTransferAccept(socketId, message.payload)
        break
      case "transfer_reject":
        handleTransferReject(socketId, message.payload)
        break
      case "transfer_cancel":
        handleTransferCancel(socketId, message.payload)
        break
      case "transfer_abort":
        handleTransferAbort(socketId, message.payload)
        break
      case "transfer_metadata":
        handleTransferMetadata(socketId, message.payload)
        break
      case "transfer_complete":
        handleTransferComplete(socketId, message.payload)
        break
      default:
        break
    }
  })

  ws.on("close", () => {
    const client = getClientBySocketId(socketId)
    if (client?.username) {
      console.log(
        `[WS] Unregistered: ${client.username} (${client.mode ?? "unknown"})`
      )
    }
    handleSocketDisconnectTransferCleanup(socketId)
    clearRateLimitsForSocket(socketId)
    clearChunkFloodState(socketId)
    unregisterClient(socketId)
    logProduction("LISTENER_CLEANUP", `socket closed ${socketId.slice(0, 8)}`)
    console.log("[WS] Client disconnected")
    console.log(`[WS] Total clients: ${getClientCount()}`)
    broadcastReceiversUpdated()
  })

  ws.on("error", (error) => {
    console.error(`[WS] Socket error (${socketId}):`, error.message)
  })
}

/**
 * @param {import('ws').WebSocket} ws
 * @returns {boolean}
 */
export function tryAcceptWebSocketConnection(ws) {
  const capacity = evaluateConnectionCapacity()
  if (!capacity.accept) {
    sendServerNotice(ws, "capacity_busy", getCapacityBusyMessage())
    try {
      ws.close(1013, "Server busy")
    } catch {
      // ignore
    }
    return false
  }

  registerSocketHandlers(ws, { softBusy: capacity.softBusy })
  return true
}
