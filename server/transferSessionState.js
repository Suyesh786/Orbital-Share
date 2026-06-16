/**
 * Server transfer session status transitions (Phase 4.1).
 * @typedef {'connecting' | 'transferring' | 'completed' | 'cancelled' | 'failed'} TransferSessionStatus
 */

/** @type {Record<TransferSessionStatus, Set<TransferSessionStatus>>} */
const ALLOWED_TRANSITIONS = {
  connecting: new Set(["transferring", "cancelled", "failed"]),
  transferring: new Set(["completed", "cancelled", "failed"]),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
}

/**
 * @param {TransferSessionStatus} from
 * @param {TransferSessionStatus} to
 * @returns {boolean}
 */
export function canTransitionSessionStatus(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from]
  return Boolean(allowed?.has(to))
}

/**
 * @param {TransferSessionStatus} from
 * @param {TransferSessionStatus} to
 * @param {string} [context]
 * @returns {boolean}
 */
export function logInvalidTransition(from, to, context = "") {
  const suffix = context ? ` (${context})` : ""
  console.log(`[SESSION] Invalid transition ${from} → ${to}${suffix}`)
  return false
}
