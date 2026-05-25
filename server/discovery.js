import { getReceivers, getSenders } from "./deviceRegistry.js"

/**
 * @param {string} requesterSocketId
 * @returns {Array<{ deviceId: string, username: string, socketId: string, mode: 'receiver' }>}
 */
export function buildReceiversListFor(requesterSocketId) {
  return getReceivers()
    .filter((client) => client.socketId !== requesterSocketId)
    .map((client) => ({
      deviceId: client.deviceId,
      username: client.username,
      socketId: client.socketId,
      mode: "receiver",
    }))
}

/**
 * Notify all sender-mode clients that the receiver list may have changed.
 */
export function broadcastReceiversUpdated() {
  const message = JSON.stringify({ type: "receivers_updated" })
  let sent = 0

  for (const client of getSenders()) {
    if (client.ws.readyState !== 1) continue
    client.ws.send(message)
    sent += 1
  }

  console.log(`[DISCOVERY] Broadcasting receivers_updated to ${sent} sender(s)`)
}
