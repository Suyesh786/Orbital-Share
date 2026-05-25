import {
  getAllClients,
  getClientBySocketId,
  getClientCount,
  unregisterClient,
} from "./deviceRegistry.js"
import { handleSocketDisconnectTransferCleanup } from "./transferHandlers.js"
import { pruneStaleRateBuckets, clearRateLimitsForSocket } from "./rateLimiter.js"
import { pruneChunkFloodStates, clearChunkFloodState } from "./chunkFloodProtection.js"
import { logProduction } from "./productionLog.js"
import {
  getTransferSession,
  removeTransferSession,
  listActiveTransferIds,
} from "./transferSessions.js"
import { CLEANUP_SWEEP_INTERVAL_MS } from "./productionLimits.js"

/** @type {ReturnType<typeof setInterval> | null} */
let sweepTimer = null

/**
 * Close zombie sessions whose peers are disconnected.
 */
function sweepZombieTransferSessions() {
  const ids = listActiveTransferIds()
  let removed = 0

  for (const transferId of ids) {
    const session = getTransferSession(transferId)
    if (!session) continue

    const sender = getClientBySocketId(session.senderSocketId)
    const receiver = getClientBySocketId(session.receiverSocketId)
    const senderOk = sender?.ws.readyState === 1
    const receiverOk = receiver?.ws.readyState === 1

    if (!senderOk || !receiverOk) {
      logProduction(
        "STALE_SESSION",
        `zombie ${transferId.slice(0, 8)} sender=${senderOk} receiver=${receiverOk}`
      )
      removeTransferSession(transferId)
      removed += 1
    }
  }

  if (removed > 0) {
    logProduction("MEMORY_CLEANUP", `removed zombie sessions=${removed}`)
  }
}

function sweepDeadRegistrySockets() {
  let removed = 0

  for (const client of getAllClients()) {
    if (client.ws.readyState === 1) continue
    handleSocketDisconnectTransferCleanup(client.socketId)
    clearRateLimitsForSocket(client.socketId)
    clearChunkFloodState(client.socketId)
    unregisterClient(client.socketId)
    removed += 1
  }

  if (removed > 0) {
    logProduction("MEMORY_CLEANUP", `removed dead registry sockets=${removed}`)
  }
}

function runCleanupSweep() {
  pruneStaleRateBuckets()
  pruneChunkFloodStates()
  sweepDeadRegistrySockets()
  sweepZombieTransferSessions()

  logProduction(
    "MEMORY_CLEANUP",
    `sweep complete clients=${getClientCount()} activeTransfers=${listActiveTransferIds().length}`
  )
}

/**
 * Start periodic background maintenance (idempotent).
 */
export function startBackgroundCleanupSweep() {
  if (sweepTimer) return
  sweepTimer = setInterval(runCleanupSweep, CLEANUP_SWEEP_INTERVAL_MS)
  if (typeof sweepTimer.unref === "function") {
    sweepTimer.unref()
  }
  logProduction("MEMORY_CLEANUP", "background sweep started")
}

export function stopBackgroundCleanupSweep() {
  if (!sweepTimer) return
  clearInterval(sweepTimer)
  sweepTimer = null
}
