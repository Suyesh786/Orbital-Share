import { getReceivers, getSenders } from "./deviceRegistry.js"
import { MAX_DISCOVERY_RECEIVERS_RETURNED } from "./productionLimits.js"

/**
 * @param {string} requesterSocketId
 * @returns {Array<{ deviceId: string, username: string, socketId: string, mode: 'receiver', deviceType: 'desktop' | 'mobile' | 'unknown', platform: 'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown' }>}
 */
export function buildReceiversListFor(requesterSocketId) {
  const receivers = getReceivers()
    .filter(
      (client) =>
        client.socketId !== requesterSocketId &&
        client.ws.readyState === 1 &&
        client.deviceId &&
        client.username
    )
    .sort((a, b) => b.connectedAt - a.connectedAt)
    .slice(0, MAX_DISCOVERY_RECEIVERS_RETURNED)
    .map((client) => ({
      deviceId: client.deviceId,
      username: client.username,
      socketId: client.socketId,
      mode: "receiver",
      deviceType: client.deviceType || "unknown",
      platform: client.platform || "unknown",
    }))

  return receivers
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
