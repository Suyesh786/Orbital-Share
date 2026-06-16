/** Phase 4.5 — in-memory production limits (no external infra). */

export const SOFT_MAX_ACTIVE_CLIENTS = 80
export const HARD_MAX_ACTIVE_CLIENTS = 100

export const MAX_ACTIVE_TRANSFERS_GLOBAL = 40
export const MAX_ACTIVE_TRANSFERS_PER_DEVICE = 3

export const MAX_JSON_MESSAGE_BYTES = 256 * 1024
export const MAX_DISCOVERY_RECEIVERS_RETURNED = 50

export const CLEANUP_SWEEP_INTERVAL_MS = 60 * 1000

export const CAPACITY_BUSY_MESSAGE =
  "AirSpace is currently busy. Please wait a moment and retry."

/** Sliding window limits: max events per windowMs per socket. */
export const RATE_LIMITS = {
  discover_receivers: { windowMs: 10_000, max: 20 },
  transfer_request: { windowMs: 60_000, max: 24 },
  transfer_accept: { windowMs: 60_000, max: 30 },
  transfer_reject: { windowMs: 60_000, max: 30 },
  transfer_cancel: { windowMs: 60_000, max: 30 },
  transfer_abort: { windowMs: 60_000, max: 20 },
  transfer_metadata: { windowMs: 60_000, max: 12 },
  transfer_complete: { windowMs: 60_000, max: 12 },
  register: { windowMs: 60_000, max: 10 },
}

export const CHUNK_RATE_WINDOW_MS = 1000
export const CHUNK_RATE_MAX_PER_WINDOW = 180

export const CHUNK_DEDUPE_WINDOW_MS = 5000
export const CHUNK_DEDUPE_MAX_KEYS = 400
