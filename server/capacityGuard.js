import { getClientCount } from "./deviceRegistry.js"
import {
  CAPACITY_BUSY_MESSAGE,
  HARD_MAX_ACTIVE_CLIENTS,
  SOFT_MAX_ACTIVE_CLIENTS,
} from "./productionLimits.js"
import { logProduction } from "./productionLog.js"

/**
 * @returns {{ accept: boolean, softBusy: boolean, hardReject: boolean }}
 */
export function evaluateConnectionCapacity() {
  const count = getClientCount()

  if (count >= HARD_MAX_ACTIVE_CLIENTS) {
    logProduction(
      "CAPACITY_LIMIT",
      `hard reject connections count=${count}`
    )
    return { accept: false, softBusy: true, hardReject: true }
  }

  if (count >= SOFT_MAX_ACTIVE_CLIENTS) {
    logProduction(
      "CAPACITY_LIMIT",
      `soft busy count=${count}`
    )
    return { accept: true, softBusy: true, hardReject: false }
  }

  return { accept: true, softBusy: false, hardReject: false }
}

export function isServerSoftBusy() {
  return getClientCount() >= SOFT_MAX_ACTIVE_CLIENTS
}

export function getCapacityBusyMessage() {
  return CAPACITY_BUSY_MESSAGE
}
