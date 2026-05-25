import { RATE_LIMITS } from "./productionLimits.js"
import { logProduction } from "./productionLog.js"

/** @type {Map<string, { count: number, windowStart: number }>} */
const buckets = new Map()

/**
 * @param {string} socketId
 * @param {string} eventType
 */
function bucketKey(socketId, eventType) {
  return `${socketId}:${eventType}`
}

/**
 * @param {string} socketId
 * @param {keyof typeof RATE_LIMITS | string} eventType
 * @returns {boolean}
 */
export function allowRate(socketId, eventType) {
  const config = RATE_LIMITS[eventType]
  if (!config) return true

  const key = bucketKey(socketId, eventType)
  const now = Date.now()
  let entry = buckets.get(key)

  if (!entry || now - entry.windowStart >= config.windowMs) {
    entry = { count: 1, windowStart: now }
    buckets.set(key, entry)
    return true
  }

  entry.count += 1
  if (entry.count > config.max) {
    logProduction(
      "RATE_LIMIT",
      `${eventType} socket=${socketId.slice(0, 8)} count=${entry.count}`
    )
    return false
  }

  return true
}

/**
 * @param {string} socketId
 */
export function clearRateLimitsForSocket(socketId) {
  const prefix = `${socketId}:`
  for (const key of buckets.keys()) {
    if (key.startsWith(prefix)) {
      buckets.delete(key)
    }
  }
}

/**
 * Periodic prune of stale bucket windows.
 */
export function pruneStaleRateBuckets() {
  const now = Date.now()
  let maxWindow = 120_000
  for (const config of Object.values(RATE_LIMITS)) {
    if (config.windowMs > maxWindow) maxWindow = config.windowMs
  }

  for (const [key, entry] of buckets.entries()) {
    if (now - entry.windowStart > maxWindow * 2) {
      buckets.delete(key)
    }
  }
}
