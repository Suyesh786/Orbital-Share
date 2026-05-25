/** Pending transfer_request phase timeout (ms) */
export const PENDING_REQUEST_TIMEOUT_MS = 45_000

/** @type {Map<string, ReturnType<typeof setTimeout>>} receiverSocketId → timer */
const pendingTimersByReceiver = new Map()

/**
 * @param {string} receiverSocketId
 * @param {() => void} onExpire
 */
export function armPendingRequestTimeout(receiverSocketId, onExpire) {
  clearPendingRequestTimeout(receiverSocketId)

  const timer = setTimeout(() => {
    pendingTimersByReceiver.delete(receiverSocketId)
    onExpire()
  }, PENDING_REQUEST_TIMEOUT_MS)

  pendingTimersByReceiver.set(receiverSocketId, timer)
}

/**
 * @param {string} receiverSocketId
 */
export function clearPendingRequestTimeout(receiverSocketId) {
  const timer = pendingTimersByReceiver.get(receiverSocketId)
  if (!timer) return

  clearTimeout(timer)
  pendingTimersByReceiver.delete(receiverSocketId)
}

/**
 * Clear all pending timers (tests / shutdown).
 */
export function clearAllPendingRequestTimeouts() {
  for (const timer of pendingTimersByReceiver.values()) {
    clearTimeout(timer)
  }
  pendingTimersByReceiver.clear()
}
