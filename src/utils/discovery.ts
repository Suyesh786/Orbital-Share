import {
  isTrustedDevice,
  sortDevicesWithTrustedFirst,
} from "@/lib/trustedDevices"
import {
  pruneStablePlacements,
  resolveStablePlacement,
} from "@/lib/discoveryLayoutRegistry"
import type { LanReceiverService } from "@/lib/electron"
import type {
  DevicePlatform,
  DeviceType,
  NearbyDevice,
} from "@/types/device"
import type { ReceiverDiscoveryEntry } from "@/types/websocket"

type ReceiverLike = ReceiverDiscoveryEntry & {
  host?: string
  port?: number
}

function inferDeviceType(receiver: ReceiverLike): DeviceType {
  if (
    receiver.deviceType === "desktop" ||
    receiver.deviceType === "mobile" ||
    receiver.deviceType === "unknown"
  ) {
    return receiver.deviceType
  }

  const lower = receiver.username.toLowerCase()
  if (
    lower.includes("mac") ||
    lower.includes("book") ||
    lower.includes("desktop") ||
    lower.includes("studio")
  ) {
    return "desktop"
  }
  if (
    lower.includes("iphone") ||
    lower.includes("ipad") ||
    lower.includes("android") ||
    lower.includes("phone")
  ) {
    return "mobile"
  }
  return "unknown"
}

function inferPlatform(receiver: ReceiverLike): DevicePlatform {
  if (
    receiver.platform === "macos" ||
    receiver.platform === "windows" ||
    receiver.platform === "linux" ||
    receiver.platform === "android" ||
    receiver.platform === "ios" ||
    receiver.platform === "unknown"
  ) {
    return receiver.platform
  }

  const lower = receiver.username.toLowerCase()
  if (lower.includes("mac") || lower.includes("book") || lower.includes("studio")) {
    return "macos"
  }
  if (lower.includes("iphone") || lower.includes("ipad")) {
    return "ios"
  }
  if (lower.includes("android") || lower.includes("phone")) {
    return "android"
  }
  return "unknown"
}

function buildNearbyDevice(
  receiver: ReceiverLike,
  index: number
): NearbyDevice {
  const trusted = isTrustedDevice(receiver.deviceId)
  const placement = resolveStablePlacement(receiver.deviceId)

  return {
    id: receiver.deviceId,
    socketId: receiver.socketId,
    host: receiver.host,
    port: receiver.port,
    username: receiver.username,
    status: "available",
    deviceType: inferDeviceType(receiver),
    platform: inferPlatform(receiver),
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
  receivers: ReceiverLike[]
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
  receivers: ReceiverLike[],
  _listSalt = 0
): NearbyDevice[] {
  return reconcileReceiversToNearbyDevices(receivers)
}

/**
 * Updates list metadata/trust styling without recomputing orbital positions.
 */
export function patchNearbyDevicesTrust(
  devices: NearbyDevice[],
  receivers: ReceiverLike[]
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
      const nextDevice: NearbyDevice = {
        ...existing,
        socketId: receiver.socketId,
        username: receiver.username,
        deviceType: inferDeviceType(receiver),
        platform: inferPlatform(receiver),
        signalStrength: trusted ? 96 : 90 - (index % 3) * 8,
      }
      if (receiver.host) {
        nextDevice.host = receiver.host
      }
      if (receiver.port) {
        nextDevice.port = receiver.port
      }
      return nextDevice
    })
    .filter((d): d is NearbyDevice => d !== null)
}

export function mapLanReceiversToDiscoveryEntries(
  receivers: LanReceiverService[]
): ReceiverLike[] {
  return receivers.map((receiver) => ({
    deviceId: receiver.deviceId,
    username: receiver.username,
    socketId: receiver.deviceId,
    mode: "receiver",
    host: receiver.host,
    port: receiver.port,
    deviceType: receiver.deviceType,
    platform: receiver.platform,
  }))
}
