import { randomUUID } from "node:crypto"
import {
  broadcastReceiversUpdated,
  buildReceiversListFor,
} from "./discovery.js"
import {
  addSocket,
  getClientBySocketId,
  getClientCount,
  registerClient,
  unregisterClient,
} from "./deviceRegistry.js"
import {
  handleSocketDisconnectTransferCleanup,
  handleTransferAccept,
  handleTransferCancel,
  handleTransferComplete,
  handleTransferReject,
  handleTransferRequest,
} from "./transferHandlers.js"

/**
 * @param {unknown} raw
 * @returns {{ type: string, payload?: unknown, socketId?: string, timestamp?: number } | null}
 */
function parseMessage(raw) {
  try {
    const text = typeof raw === "string" ? raw : raw.toString("utf8")
    const data = JSON.parse(text)
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * @param {string} socketId
 * @param {import('ws').WebSocket} ws
 * @param {unknown} payload
 */
function handleRegister(socketId, ws, payload) {
  if (!payload || typeof payload !== "object") return

  const { username, deviceId, mode } = payload
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
  })

  if (!registered) return

  console.log("[REGISTER]")
  console.log(`username: ${trimmedUsername}`)
  console.log(`mode: ${mode}`)
  console.log(`deviceId: ${deviceId.trim()}`)

  ws.send(
    JSON.stringify({
      type: "registered",
      payload: {
        socketId,
        deviceId: deviceId.trim(),
        username: trimmedUsername,
        mode,
      },
    })
  )

  broadcastReceiversUpdated()
}

/**
 * @param {string} socketId
 * @param {import('ws').WebSocket} ws
 */
function handleDiscoverReceivers(socketId, ws) {
  const receivers = buildReceiversListFor(socketId)

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
 */
export function registerSocketHandlers(ws) {
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

  ws.on("message", (raw) => {
    const message = parseMessage(raw)
    if (!message) return

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
    unregisterClient(socketId)
    console.log("[WS] Client disconnected")
    console.log(`[WS] Total clients: ${getClientCount()}`)
    broadcastReceiversUpdated()
  })

  ws.on("error", (error) => {
    console.error(`[WS] Socket error (${socketId}):`, error.message)
  })
}
