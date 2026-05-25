/**
 * @typedef {Object} RegistryClient
 * @property {string} socketId
 * @property {import('ws').WebSocket} ws
 * @property {string | null} username
 * @property {string | null} deviceId
 * @property {'sender' | 'receiver' | null} mode
 * @property {number} connectedAt
 * @property {number} lastSeen
 */

/** @type {Map<string, RegistryClient>} */
const clientsBySocket = new Map()

/** @type {Map<string, Set<string>>} deviceId → socketIds (multi-tab / same device) */
const socketsByDeviceId = new Map()

/**
 * @param {string} socketId
 * @param {import('ws').WebSocket} ws
 */
export function addSocket(socketId, ws) {
  const now = Date.now()
  clientsBySocket.set(socketId, {
    socketId,
    ws,
    username: null,
    deviceId: null,
    mode: null,
    connectedAt: now,
    lastSeen: now,
  })
}

/**
 * @param {string} socketId
 * @returns {RegistryClient | undefined}
 */
export function getClientBySocketId(socketId) {
  return clientsBySocket.get(socketId)
}

/**
 * @param {string} socketId
 * @param {{ username: string, deviceId: string, mode: 'sender' | 'receiver' }} data
 * @returns {boolean}
 */
export function registerClient(socketId, data) {
  const client = clientsBySocket.get(socketId)
  if (!client) return false

  const { username, deviceId, mode } = data
  if (!username || !deviceId || (mode !== "sender" && mode !== "receiver")) {
    return false
  }

  const now = Date.now()
  const updated = {
    ...client,
    username,
    deviceId,
    mode,
    lastSeen: now,
  }

  clientsBySocket.set(socketId, updated)

  let sockets = socketsByDeviceId.get(deviceId)
  if (!sockets) {
    sockets = new Set()
    socketsByDeviceId.set(deviceId, sockets)
  }
  sockets.add(socketId)

  return true
}

/**
 * @param {string} socketId
 * @param {'sender' | 'receiver'} mode
 * @returns {boolean}
 */
export function updateClientMode(socketId, mode) {
  const client = clientsBySocket.get(socketId)
  if (!client || !client.deviceId) return false

  clientsBySocket.set(socketId, {
    ...client,
    mode,
    lastSeen: Date.now(),
  })
  return true
}

/**
 * @param {string} socketId
 */
export function unregisterClient(socketId) {
  const client = clientsBySocket.get(socketId)
  if (!client) return

  if (client.deviceId) {
    const sockets = socketsByDeviceId.get(client.deviceId)
    if (sockets) {
      sockets.delete(socketId)
      if (sockets.size === 0) {
        socketsByDeviceId.delete(client.deviceId)
      }
    }
  }

  clientsBySocket.delete(socketId)
}

/** @deprecated use unregisterClient */
export function removeClient(socketId) {
  unregisterClient(socketId)
}

/**
 * @returns {RegistryClient[]}
 */
export function getAllClients() {
  return Array.from(clientsBySocket.values()).filter((c) => c.deviceId)
}

export function getReceivers() {
  return getAllClients().filter((c) => c.mode === "receiver")
}

export function getSenders() {
  return getAllClients().filter((c) => c.mode === "sender")
}

/**
 * @param {string} deviceId
 * @returns {RegistryClient | undefined}
 */
export function getClientByDeviceId(deviceId) {
  const sockets = socketsByDeviceId.get(deviceId)
  if (!sockets?.size) return undefined
  const firstSocketId = sockets.values().next().value
  return firstSocketId ? clientsBySocket.get(firstSocketId) : undefined
}

export function getClientCount() {
  return clientsBySocket.size
}

export function getRegisteredCount() {
  return getAllClients().length
}
