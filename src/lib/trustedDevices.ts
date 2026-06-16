/**
 * Local trust + interaction memory (Phase 4.4 — client-only, no protocol changes).
 */

export const TRUSTED_DEVICES_STORAGE_KEY = "orbitalshare_trusted_devices"
export const DEVICE_INTERACTIONS_STORAGE_KEY = "orbitalshare_device_interactions"
export const TRANSFER_INCREMENT_DEDUP_KEY = "orbitalshare_transfer_increment_dedup"

/** Completed transfers before trust suggestion may appear */
export const TRUST_SUGGESTION_THRESHOLD = 3

/** Extra completed transfers after "Maybe Later" before suggesting again */
export const TRUST_MAYBE_LATER_EXTRA_TRANSFERS = 3

export type TrustSuggestionRole = "sender" | "receiver"

export interface TrustedDeviceRecord {
  deviceId: string
  username: string
  createdAt: number
  interactionCount: number
  lastTransferAt: number
}

export interface DeviceInteractionRecord {
  deviceId: string
  username: string
  interactionCount: number
  lastTransferAt: number
  /** Do not suggest again until count reaches this value (Maybe Later) */
  suggestAgainAfterCount?: number
  /** Last relationship count when sender trust was prompted */
  promptedAtCountSender?: number
  /** Last relationship count when receiver trust was prompted */
  promptedAtCountReceiver?: number
}

type InteractionMap = Record<string, DeviceInteractionRecord>
type IncrementDedupMap = Record<string, true>

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable
  }
}

function loadTrustedList(): TrustedDeviceRecord[] {
  const list = readJson<TrustedDeviceRecord[]>(TRUSTED_DEVICES_STORAGE_KEY, [])
  return Array.isArray(list) ? list : []
}

function saveTrustedList(list: TrustedDeviceRecord[]): void {
  writeJson(TRUSTED_DEVICES_STORAGE_KEY, list)
}

function loadInteractions(): InteractionMap {
  const map = readJson<InteractionMap>(DEVICE_INTERACTIONS_STORAGE_KEY, {})
  return map && typeof map === "object" ? map : {}
}

function saveInteractions(map: InteractionMap): void {
  writeJson(DEVICE_INTERACTIONS_STORAGE_KEY, map)
}

function loadIncrementDedup(): IncrementDedupMap {
  const map = readJson<IncrementDedupMap>(TRANSFER_INCREMENT_DEDUP_KEY, {})
  return map && typeof map === "object" ? map : {}
}

function saveIncrementDedup(map: IncrementDedupMap): void {
  writeJson(TRANSFER_INCREMENT_DEDUP_KEY, map)
}

export function logTrustDev(
  message: string,
  detail?: Record<string, string | number | boolean>
): void {
  if (!import.meta.env.DEV) return
  const extra = detail
    ? ` ${Object.entries(detail)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`
    : ""
  console.log(`[TRUST] ${message}${extra}`)
}

function sessionDismissKey(deviceId: string): string {
  return `orbitalshare_trust_session_dismiss_${deviceId}`
}

export function isSessionTrustSuggestionDismissed(deviceId: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return sessionStorage.getItem(sessionDismissKey(deviceId)) === "1"
  } catch {
    return false
  }
}

export function dismissTrustSuggestionForSession(deviceId: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(sessionDismissKey(deviceId), "1")
  } catch {
    // ignore
  }
}

export function getTrustedDevices(): TrustedDeviceRecord[] {
  return loadTrustedList()
}

export function isTrustedDevice(deviceId: string): boolean {
  if (!deviceId) return false
  return loadTrustedList().some((entry) => entry.deviceId === deviceId)
}

export function getInteractionRecord(
  deviceId: string
): DeviceInteractionRecord | undefined {
  if (!deviceId) return undefined
  return loadInteractions()[deviceId]
}

export function getInteractionCountBetweenDevices(deviceId: string): number {
  return getInteractionRecord(deviceId)?.interactionCount ?? 0
}

/**
 * Increments bidirectional relationship count (any transfer direction).
 * Dedupes by transferId so finalize cannot double-count.
 */
export function incrementInteractionCount(
  deviceId: string,
  username: string,
  transferId?: string
): number {
  if (!deviceId) return 0

  if (transferId) {
    const dedup = loadIncrementDedup()
    if (dedup[transferId]) {
      const existing = getInteractionCountBetweenDevices(deviceId)
      logTrustDev("increment skipped (duplicate transfer)", {
        transferId: transferId.slice(0, 8),
        count: existing,
      })
      return existing
    }
    dedup[transferId] = true
    const keys = Object.keys(dedup)
    if (keys.length > 200) {
      delete dedup[keys[0]]
    }
    saveIncrementDedup(dedup)
  }

  const interactions = loadInteractions()
  const existing = interactions[deviceId]
  const now = Date.now()
  const nextCount = (existing?.interactionCount ?? 0) + 1

  interactions[deviceId] = {
    deviceId,
    username: username || existing?.username || "Unknown",
    interactionCount: nextCount,
    lastTransferAt: now,
    suggestAgainAfterCount: existing?.suggestAgainAfterCount,
    promptedAtCountSender: existing?.promptedAtCountSender,
    promptedAtCountReceiver: existing?.promptedAtCountReceiver,
  }

  saveInteractions(interactions)

  const trusted = loadTrustedList()
  const trustedIndex = trusted.findIndex((t) => t.deviceId === deviceId)
  if (trustedIndex >= 0) {
    trusted[trustedIndex] = {
      ...trusted[trustedIndex],
      username: interactions[deviceId].username,
      interactionCount: nextCount,
      lastTransferAt: now,
    }
    saveTrustedList(trusted)
  }

  logTrustDev("relationship count incremented", {
    peer: username,
    count: nextCount,
    source: transferId ? "finalize" : "unknown",
  })

  return nextCount
}

export function addTrustedDevice(
  deviceId: string,
  username: string
): TrustedDeviceRecord {
  const interactions = loadInteractions()
  const interaction = interactions[deviceId]
  const now = Date.now()
  const count = interaction?.interactionCount ?? 0

  const record: TrustedDeviceRecord = {
    deviceId,
    username: username || interaction?.username || "Unknown",
    createdAt: now,
    interactionCount: count,
    lastTransferAt: interaction?.lastTransferAt ?? now,
  }

  const list = loadTrustedList().filter((t) => t.deviceId !== deviceId)
  list.push(record)
  saveTrustedList(list)

  return record
}

export function removeTrustedDevice(deviceId: string): void {
  const list = loadTrustedList().filter((t) => t.deviceId !== deviceId)
  saveTrustedList(list)

  const interactions = loadInteractions()
  if (interactions[deviceId]) {
    interactions[deviceId] = {
      ...interactions[deviceId],
      promptedAtCountSender: undefined,
      promptedAtCountReceiver: undefined,
      suggestAgainAfterCount: undefined,
    }
    saveInteractions(interactions)
  }
}

function getPromptedAtCount(
  entry: DeviceInteractionRecord | undefined,
  role: TrustSuggestionRole
): number | undefined {
  if (!entry) return undefined
  return role === "sender"
    ? entry.promptedAtCountSender
    : entry.promptedAtCountReceiver
}

/**
 * Bidirectional relationship eligibility — sender and receiver can each get a suggestion.
 */
export function shouldShowTrustSuggestion(
  deviceId: string,
  role: TrustSuggestionRole
): boolean {
  if (!deviceId || isTrustedDevice(deviceId)) {
    logTrustDev("ineligible", { reason: "trusted", role })
    return false
  }
  if (isSessionTrustSuggestionDismissed(deviceId)) {
    logTrustDev("ineligible", { reason: "session_dismiss", role })
    return false
  }

  const count = getInteractionCountBetweenDevices(deviceId)
  const entry = getInteractionRecord(deviceId)
  const peer = entry?.username ?? deviceId.slice(0, 8)

  if (count < TRUST_SUGGESTION_THRESHOLD) {
    logTrustDev("ineligible", {
      peer,
      count,
      role,
      reason: "below_threshold",
    })
    return false
  }

  if (
    entry?.suggestAgainAfterCount !== undefined &&
    count >= entry.suggestAgainAfterCount
  ) {
    logTrustDev(`${role} eligible (snooze expired)`, { peer, count })
    return true
  }

  const promptedAt = getPromptedAtCount(entry, role)
  if (promptedAt !== undefined && count <= promptedAt) {
    logTrustDev("ineligible", {
      peer,
      count,
      role,
      reason: "already_prompted_at_count",
    })
    return false
  }

  logTrustDev(`${role} eligible`, { peer, count })
  return true
}

export function markTrustSuggestionPrompted(
  deviceId: string,
  role: TrustSuggestionRole
): void {
  const interactions = loadInteractions()
  const entry = interactions[deviceId]
  if (!entry) return

  const count = entry.interactionCount
  interactions[deviceId] = {
    ...entry,
    ...(role === "sender"
      ? { promptedAtCountSender: count }
      : { promptedAtCountReceiver: count }),
  }
  saveInteractions(interactions)
}

export function markTrustSuggestionMaybeLater(deviceId: string): void {
  const interactions = loadInteractions()
  const entry = interactions[deviceId]
  if (!entry) return

  interactions[deviceId] = {
    ...entry,
    suggestAgainAfterCount:
      entry.interactionCount + TRUST_MAYBE_LATER_EXTRA_TRANSFERS,
  }
  saveInteractions(interactions)

  logTrustDev("snoozed", {
    peer: entry.username,
    untilCount: interactions[deviceId].suggestAgainAfterCount ?? 0,
  })
}

export function sortDevicesWithTrustedFirst<
  T extends { id: string },
>(devices: T[]): T[] {
  return [...devices].sort((a, b) => {
    const aTrusted = isTrustedDevice(a.id)
    const bTrusted = isTrustedDevice(b.id)
    if (aTrusted !== bTrusted) return aTrusted ? -1 : 1
    return 0
  })
}

export function formatTrustRelationship(
  localUsername: string,
  peerUsername: string
): string {
  return `${localUsername} ↔ ${peerUsername}`
}
