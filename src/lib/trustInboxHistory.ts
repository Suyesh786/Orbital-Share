export const TRUST_INBOX_HISTORY_KEY = "orbitalshare_trust_inbox_history"

export type TrustInboxRole = "sender" | "receiver"

export type TrustNotificationStatus =
  | "pending"
  | "trusted"
  | "snoozed"
  | "dismissed"
  | "archived"

export interface TrustInboxNotification {
  id: string
  deviceId: string
  peerUsername: string
  role: TrustInboxRole
  status: TrustNotificationStatus
  read: boolean
  createdAt: number
  updatedAt: number
}

function readHistory(): TrustInboxNotification[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(TRUST_INBOX_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TrustInboxNotification[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeHistory(items: TrustInboxNotification[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TRUST_INBOX_HISTORY_KEY, JSON.stringify(items))
  } catch {
    // Storage unavailable
  }
}

const MAX_TRUST_INBOX_ITEMS = 200

export function loadTrustInboxHistory(): TrustInboxNotification[] {
  const sorted = readHistory().sort((a, b) => b.updatedAt - a.updatedAt)
  if (sorted.length <= MAX_TRUST_INBOX_ITEMS) {
    return sorted
  }
  return sorted.slice(0, MAX_TRUST_INBOX_ITEMS)
}

export function saveTrustInboxHistory(items: TrustInboxNotification[]): void {
  writeHistory(items)
}

export function upsertTrustInboxHistory(
  items: TrustInboxNotification[]
): void {
  saveTrustInboxHistory(items)
}
