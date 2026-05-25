import {
  CHUNK_DEDUPE_MAX_KEYS,
  CHUNK_DEDUPE_WINDOW_MS,
  CHUNK_RATE_MAX_PER_WINDOW,
  CHUNK_RATE_WINDOW_MS,
} from "./productionLimits.js"
import { logProduction } from "./productionLog.js"

/**
 * @typedef {{ windowStart: number, count: number, recent: Map<string, number> }} ChunkFloodState
 */

/** @type {Map<string, ChunkFloodState>} */
const bySender = new Map()

/**
 * @param {Buffer} buffer
 * @returns {string | null}
 */
function chunkDedupeKey(buffer) {
  if (buffer.length < 5 || buffer[0] !== 1) return null
  try {
    const headerLen = buffer.readUInt32LE(1)
    if (headerLen <= 0 || buffer.length < 5 + headerLen) return null
    const headerJson = buffer.subarray(5, 5 + headerLen).toString("utf8")
    const header = JSON.parse(headerJson)
    if (
      !header ||
      typeof header.transferId !== "string" ||
      typeof header.fileId !== "string" ||
      typeof header.chunkIndex !== "number"
    ) {
      return null
    }
    return `${header.transferId}:${header.fileId}:${header.chunkIndex}`
  } catch {
    return null
  }
}

/**
 * @param {string} senderSocketId
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function allowChunkRelay(senderSocketId, buffer) {
  const now = Date.now()
  let state = bySender.get(senderSocketId)

  if (!state || now - state.windowStart >= CHUNK_RATE_WINDOW_MS) {
    state = { windowStart: now, count: 0, recent: new Map() }
    bySender.set(senderSocketId, state)
  }

  state.count += 1
  if (state.count > CHUNK_RATE_MAX_PER_WINDOW) {
    logProduction(
      "FLOOD_PROTECTION",
      `chunk burst sender=${senderSocketId.slice(0, 8)} count=${state.count}`
    )
    return false
  }

  const key = chunkDedupeKey(buffer)
  if (key) {
    const last = state.recent.get(key)
    if (last && now - last < CHUNK_DEDUPE_WINDOW_MS) {
      logProduction(
        "FLOOD_PROTECTION",
        `duplicate chunk sender=${senderSocketId.slice(0, 8)}`
      )
      return false
    }
    state.recent.set(key, now)

    if (state.recent.size > CHUNK_DEDUPE_MAX_KEYS) {
      for (const [k, t] of state.recent.entries()) {
        if (now - t > CHUNK_DEDUPE_WINDOW_MS) {
          state.recent.delete(k)
        }
      }
    }
  }

  return true
}

/**
 * @param {string} socketId
 */
export function clearChunkFloodState(socketId) {
  bySender.delete(socketId)
}

/**
 * Remove idle sender flood tracking.
 */
export function pruneChunkFloodStates() {
  const now = Date.now()
  for (const [socketId, state] of bySender.entries()) {
    if (now - state.windowStart > CHUNK_RATE_WINDOW_MS * 30) {
      bySender.delete(socketId)
    }
  }
}
