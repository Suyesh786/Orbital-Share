/** Inactivity timeout for active transfer sessions (15 minutes) */
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const idleTimersByTransfer = new Map()

/** @type {(transferId: string) => void} */
let idleExpireHandler = () => {}

/**
 * @param {(transferId: string) => void} handler
 */
export function registerSessionIdleExpireHandler(handler) {
  idleExpireHandler = handler
}

/**
 * @param {string} transferId
 */
export function clearSessionIdleTimeout(transferId) {
  const timer = idleTimersByTransfer.get(transferId)
  if (!timer) return
  clearTimeout(timer)
  idleTimersByTransfer.delete(transferId)
}

/**
 * Reset inactivity timer for an active session.
 * @param {string} transferId
 */
export function refreshSessionIdleTimeout(transferId) {
  clearSessionIdleTimeout(transferId)
  const timer = setTimeout(() => {
    idleTimersByTransfer.delete(transferId)
    idleExpireHandler(transferId)
  }, SESSION_IDLE_TIMEOUT_MS)
  idleTimersByTransfer.set(transferId, timer)
}
