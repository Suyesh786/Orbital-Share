import {
  isTrustedDevice,
  sortDevicesWithTrustedFirst,
} from "@/lib/trustedDevices"
import {
  pruneStablePlacements,
  resolveStablePlacement,
} from "@/lib/discoveryLayoutRegistry"
import type { DeviceType, NearbyDevice } from "@/types/device"
import type { ReceiverDiscoveryEntry } from "@/types/websocket"

function inferDeviceType(username: string): DeviceType {
  const lower = username.toLowerCase()
  if (
    lower.includes("mac") ||
    lower.includes("ipad") ||
    lower.includes("studio")
  ) {
    return "mac"
  }
  return "android"
}

function buildNearbyDevice(
  receiver: ReceiverDiscoveryEntry,
  index: number
): NearbyDevice {
  const trusted = isTrustedDevice(receiver.deviceId)
  const placement = resolveStablePlacement(receiver.deviceId)

  return {
    id: receiver.deviceId,
    socketId: receiver.socketId,
    username: receiver.username,
    status: "available",
    deviceType: inferDeviceType(receiver.username),
    signalStrength: trusted ? 96 : 90 - (index % 3) * 8,
    angle: placement.angle,
    orbit: placement.orbit,
    radiusPx: placement.radiusPx,
  }
}

/**
 * Incremental discovery mapping — preserves orbital positions for existing devices.
 */
export function reconcileReceiversToNearbyDevices(
  receivers: ReceiverDiscoveryEntry[]
): NearbyDevice[] {
  if (receivers.length === 0) {
    pruneStablePlacements([])
    return []
  }

  const sorted = sortDevicesWithTrustedFirst(
    receivers.map((receiver) => ({
      receiver,
      id: receiver.deviceId,
    }))
  )

  pruneStablePlacements(sorted.map((entry) => entry.receiver.deviceId))

  return sorted.map((entry, index) =>
    buildNearbyDevice(entry.receiver, index)
  )
}

/**
 * @deprecated Use reconcileReceiversToNearbyDevices for stable incremental layout.
 */
export function mapReceiversToNearbyDevices(
  receivers: ReceiverDiscoveryEntry[],
  _listSalt = 0
): NearbyDevice[] {
  return reconcileReceiversToNearbyDevices(receivers)
}

/**
 * Updates list metadata/trust styling without recomputing orbital positions.
 */
export function patchNearbyDevicesTrust(
  devices: NearbyDevice[],
  receivers: ReceiverDiscoveryEntry[]
): NearbyDevice[] {
  const byId = new Map(receivers.map((r) => [r.deviceId, r]))
  const sortedIds = sortDevicesWithTrustedFirst(
    receivers.map((r) => ({ id: r.deviceId, receiver: r }))
  ).map((e) => e.receiver.deviceId)

  const deviceMap = new Map(devices.map((d) => [d.id, d]))
  return sortedIds
    .map((id, index) => {
      const receiver = byId.get(id)
      const existing = deviceMap.get(id)
      if (!receiver || !existing) return null
      const trusted = isTrustedDevice(id)
      return {
        ...existing,
        socketId: receiver.socketId,
        username: receiver.username,
        deviceType: inferDeviceType(receiver.username),
        signalStrength: trusted ? 96 : 90 - (index % 3) * 8,
      }
    })
    .filter((d): d is NearbyDevice => d !== null)
}
