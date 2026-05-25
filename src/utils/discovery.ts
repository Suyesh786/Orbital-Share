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

/**
 * Maps server receiver entries to radar-ready NearbyDevice layout.
 * Assigns deterministic orbit positions from list index (UI-only).
 */
export function mapReceiversToNearbyDevices(
  receivers: ReceiverDiscoveryEntry[]
): NearbyDevice[] {
  const count = receivers.length
  if (count === 0) return []

  return receivers.map((receiver, index) => {
    const angle = (360 / count) * index - 90
    const orbit = (index % 2) + 1

    return {
      id: receiver.deviceId,
      socketId: receiver.socketId,
      username: receiver.username,
      status: "available",
      deviceType: inferDeviceType(receiver.username),
      signalStrength: 90 - (index % 3) * 8,
      angle,
      orbit,
    }
  })
}
