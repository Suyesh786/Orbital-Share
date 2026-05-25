import { create } from "zustand"
import {
  loadTrustInboxHistory,
  saveTrustInboxHistory,
  type TrustInboxNotification,
  type TrustInboxRole,
  type TrustNotificationStatus,
} from "@/lib/trustInboxHistory"
import {
  addTrustedDevice,
  dismissTrustSuggestionForSession,
  markTrustSuggestionMaybeLater,
  markTrustSuggestionPrompted,
  shouldShowTrustSuggestion,
} from "@/lib/trustedDevices"

export type { TrustInboxRole, TrustNotificationStatus, TrustInboxNotification }

interface TrustInboxState {
  hydrated: boolean
  items: TrustInboxNotification[]
  isOpen: boolean
  activeItemId: string | null
  iconPulse: boolean
  successFlashId: string | null
  hydrate: () => void
  enqueueSuggestion: (input: {
    deviceId: string
    peerUsername: string
    role: TrustInboxRole
  }) => void
  toggleInbox: () => void
  openInbox: () => void
  closeInbox: () => void
  selectItem: (id: string) => void
  markAllRead: () => void
  trustItem: (id: string) => void
  maybeLaterItem: (id: string) => void
  dismissItemForSession: (id: string) => void
  consumeIconPulse: () => void
}

function persist(items: TrustInboxNotification[]): void {
  saveTrustInboxHistory(items)
}

function findPendingForPair(
  items: TrustInboxNotification[],
  deviceId: string,
  role: TrustInboxRole
): TrustInboxNotification | undefined {
  return items.find(
    (item) =>
      item.deviceId === deviceId &&
      item.role === role &&
      item.status === "pending"
  )
}

export const useTrustInboxStore = create<TrustInboxState>((set, get) => ({
  hydrated: false,
  items: [],
  isOpen: false,
  activeItemId: null,
  iconPulse: false,
  successFlashId: null,

  hydrate: () => {
    if (get().hydrated) return
    const items = loadTrustInboxHistory()
    set({ items, hydrated: true })
  },

  enqueueSuggestion: ({ deviceId, peerUsername, role }) => {
    get().hydrate()
    if (!deviceId || !peerUsername) return
    if (!shouldShowTrustSuggestion(deviceId, role)) return

    markTrustSuggestionPrompted(deviceId, role)

    const now = Date.now()
    let items = [...get().items]
    const pending = findPendingForPair(items, deviceId, role)

    if (pending) {
      items = items.map((item) =>
        item.id === pending.id
          ? { ...item, unread: true, updatedAt: now, peerUsername }
          : item
      )
      persist(items)
      set({
        items,
        activeItemId: pending.id,
        iconPulse: true,
        isOpen: true,
      })
      return
    }

    const item: TrustInboxNotification = {
      id: crypto.randomUUID(),
      deviceId,
      peerUsername,
      role,
      status: "pending",
      read: false,
      createdAt: now,
      updatedAt: now,
    }

    items = [item, ...items]
    persist(items)
    set({
      items,
      activeItemId: item.id,
      iconPulse: true,
      isOpen: true,
    })

  },

  toggleInbox: () => {
    get().hydrate()
    const { isOpen } = get()
    if (isOpen) {
      get().closeInbox()
    } else {
      get().openInbox()
    }
  },

  openInbox: () => {
    get().hydrate()
    const items = get().items.map((item) => ({ ...item, read: true }))
    persist(items)
    set({
      isOpen: true,
      items,
      iconPulse: false,
    })
  },

  closeInbox: () => {
    set({ isOpen: false, activeItemId: null, successFlashId: null })
  },

  selectItem: (id) => {
    const items = get().items.map((item) =>
      item.id === id ? { ...item, read: true } : item
    )
    persist(items)
    set({ activeItemId: id, items })
  },

  markAllRead: () => {
    const items = get().items.map((item) => ({ ...item, read: true }))
    persist(items)
    set({ items })
  },

  trustItem: (id) => {
    const item = get().items.find((entry) => entry.id === id)
    if (!item) return

    addTrustedDevice(item.deviceId, item.peerUsername)
    window.dispatchEvent(new CustomEvent("orbitalshare-trust-changed"))

    const now = Date.now()
    const items = get().items.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "trusted" as const,
            read: true,
            updatedAt: now,
          }
        : entry
    )
    persist(items)
    set({ items, successFlashId: id, activeItemId: id })

    window.setTimeout(() => {
      if (get().successFlashId === id) {
        set({ successFlashId: null })
      }
    }, 900)
  },

  maybeLaterItem: (id) => {
    const item = get().items.find((entry) => entry.id === id)
    if (!item) return

    markTrustSuggestionMaybeLater(item.deviceId)

    const now = Date.now()
    const items = get().items.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "snoozed" as const,
            read: true,
            updatedAt: now,
          }
        : entry
    )
    persist(items)
    set({ items, activeItemId: id })
  },

  dismissItemForSession: (id) => {
    const item = get().items.find((entry) => entry.id === id)
    if (!item) return

    dismissTrustSuggestionForSession(item.deviceId)

    const now = Date.now()
    const items = get().items.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "dismissed" as const,
            read: true,
            updatedAt: now,
          }
        : entry
    )
    persist(items)
    set({ items, activeItemId: id })
  },

  consumeIconPulse: () => set({ iconPulse: false }),
}))

export const selectTrustInboxUnreadCount = (state: TrustInboxState) =>
  state.items.filter((item) => !item.read).length

export const selectTrustInboxHasUnread = (state: TrustInboxState) =>
  state.items.some((item) => !item.read)

export const selectTrustInboxActiveItem = (state: TrustInboxState) =>
  state.items.find((item) => item.id === state.activeItemId) ?? null

export function enqueueTrustSuggestion(
  deviceId: string,
  peerUsername: string,
  role: TrustInboxRole
): void {
  useTrustInboxStore.getState().enqueueSuggestion({
    deviceId,
    peerUsername,
    role,
  })
}

