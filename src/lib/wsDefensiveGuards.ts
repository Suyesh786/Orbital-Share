import type { ReceiverDiscoveryEntry } from "@/types/websocket"

/** Max JSON payload accepted from server (defensive). */
export const MAX_CLIENT_WS_JSON_BYTES = 512 * 1024

/** Cap discovery list size to protect radar render stability. */
export const MAX_DISCOVERY_CLIENT_DEVICES = 50

const IS_DEV = import.meta.env.DEV

/**
 * Reject oversized websocket text frames before JSON.parse.
 */
export function guardInboundJsonSize(raw: unknown): boolean {
  let bytes = 0
  if (typeof raw === "string") {
    bytes = new TextEncoder().encode(raw).length
  } else if (raw instanceof ArrayBuffer) {
    bytes = raw.byteLength
  } else if (raw instanceof Blob) {
    return true
  } else {
    return false
  }

  if (bytes > MAX_CLIENT_WS_JSON_BYTES) {
    if (IS_DEV) {
      console.warn("[MALFORMED_PACKET] oversized inbound frame", bytes)
    }
    return false
  }

  return true
}

/**
 * Trim discovery payloads — trusted-first ordering happens in discovery utils.
 */
export function capDiscoveryReceivers(
  receivers: ReceiverDiscoveryEntry[]
): ReceiverDiscoveryEntry[] {
  if (receivers.length <= MAX_DISCOVERY_CLIENT_DEVICES) {
    return receivers
  }

  if (IS_DEV) {
    console.warn(
      "[FLOOD_PROTECTION] discovery list capped",
      receivers.length,
      "→",
      MAX_DISCOVERY_CLIENT_DEVICES
    )
  }

  return receivers.slice(0, MAX_DISCOVERY_CLIENT_DEVICES)
}

/**
 * Ignore unknown server_notice payloads safely.
 */
export function parseServerNoticeMessage(
  payload: unknown
): string | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as { code?: unknown; message?: unknown }
  if (typeof p.message !== "string" || !p.message.trim()) return null
  return p.message.trim()
}
