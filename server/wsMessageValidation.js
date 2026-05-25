import { MAX_JSON_MESSAGE_BYTES } from "./productionLimits.js"
import { logProduction } from "./productionLog.js"

const ALLOWED_TYPES = new Set([
  "register",
  "discover_receivers",
  "transfer_request",
  "transfer_accept",
  "transfer_reject",
  "transfer_cancel",
  "transfer_abort",
  "transfer_metadata",
  "transfer_complete",
])

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, bytes: number, reason?: string }}
 */
export function validateInboundRawSize(raw) {
  let bytes = 0
  if (typeof raw === "string") {
    bytes = Buffer.byteLength(raw, "utf8")
  } else if (Buffer.isBuffer(raw)) {
    bytes = raw.length
  } else if (raw instanceof ArrayBuffer) {
    bytes = raw.byteLength
  } else {
    return { ok: false, bytes: 0, reason: "unsupported_payload" }
  }

  if (bytes > MAX_JSON_MESSAGE_BYTES) {
    logProduction("MALFORMED_PACKET", `oversized json bytes=${bytes}`)
    return { ok: false, bytes, reason: "oversized" }
  }

  return { ok: true, bytes }
}

/**
 * @param {unknown} raw
 * @returns {{ type: string, payload?: unknown } | null}
 */
export function parseValidatedMessage(raw) {
  const sizeCheck = validateInboundRawSize(raw)
  if (!sizeCheck.ok) return null

  try {
    const text =
      typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")
    const data = JSON.parse(text)
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      logProduction("MALFORMED_PACKET", "invalid message shape")
      return null
    }

    if (!ALLOWED_TYPES.has(data.type)) {
      logProduction("MALFORMED_PACKET", `unknown type=${data.type}`)
      return null
    }

    if (
      data.payload !== undefined &&
      data.payload !== null &&
      typeof data.payload !== "object"
    ) {
      logProduction("MALFORMED_PACKET", `invalid payload type=${data.type}`)
      return null
    }

    return data
  } catch {
    logProduction("MALFORMED_PACKET", "json parse failed")
    return null
  }
}
