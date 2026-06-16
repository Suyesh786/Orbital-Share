import {
  MAX_ACTIVE_TRANSFERS_GLOBAL,
  MAX_ACTIVE_TRANSFERS_PER_DEVICE,
} from "./productionLimits.js"
import { logProduction } from "./productionLog.js"
import {
  countActiveTransferSessions,
  countActiveTransfersForDeviceId,
} from "./transferSessions.js"

/**
 * @param {string} [deviceId]
 * @returns {boolean}
 */
export function canAcceptNewTransfer(deviceId) {
  const global = countActiveTransferSessions()
  if (global >= MAX_ACTIVE_TRANSFERS_GLOBAL) {
    logProduction(
      "CAPACITY_LIMIT",
      `max global transfers=${global}`
    )
    return false
  }

  if (deviceId) {
    const perDevice = countActiveTransfersForDeviceId(deviceId)
    if (perDevice >= MAX_ACTIVE_TRANSFERS_PER_DEVICE) {
      logProduction(
        "CAPACITY_LIMIT",
        `max device transfers device=${deviceId.slice(0, 8)} count=${perDevice}`
      )
      return false
    }
  }

  return true
}
