// AirSpace — Tauri v2 IPC Bridge
// Replaces the Electron preload bridge (window.orbitalShareDesktop)
// with Tauri v2's invoke/listen API.
//
// CONTRACT: Every function signature exported from this file is identical
// to what the Electron preload.cjs exposed. React components are untouched.

import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type { DevicePlatform, DeviceType } from "@/types/device"

// ─── Re-exported payload types (unchanged — used by React components) ─────────

export interface LanReceiverService {
  deviceId: string
  username: string
  host: string
  port: number
  deviceType?: DeviceType
  platform?: DevicePlatform
}

export interface LanDiscoveryErrorPayload {
  scope: string
  message: string
  detail?: string
  timestamp: number
}

export interface ReceiverPresencePayload {
  available: boolean
  deviceId?: string
  username?: string
  deviceType?: DeviceType
  platform?: DevicePlatform
}

export interface IncomingTransferNotificationPayload {
  senderUsername: string
  requesterSocketId?: string
  fileCount: number
}

export interface TransferProgressNotificationPayload {
  transferId: string
  peerUsername?: string
  fileName?: string
  progress: number
}

export interface TransferCompletedNotificationPayload {
  transferId?: string
  fileCount: number
  directory?: string | null
}

export interface IncomingTransferNotificationActionPayload {
  requesterSocketId?: string
  action: "accept" | "decline"
}

export interface RuntimeResumePayload {
  receiverEnabled: boolean
  lanDiscoveryActive: boolean
}

export interface ReceivedFileSavePayload {
  name: string
  type: string
  bytes: ArrayBuffer
}

export interface ReceivedFileSaveResult {
  savedCount: number
  directory: string | null
}

// ─── Internal API interface ───────────────────────────────────────────────────

interface AirSpaceDesktopApi {
  getLanReceivers: () => Promise<LanReceiverService[]>
  getLanDiscoveryError: () => Promise<LanDiscoveryErrorPayload | null>
  setReceiverPresence: (presence: ReceiverPresencePayload) => Promise<boolean>
  getReceiverEnabled: () => Promise<boolean>
  setReceiverEnabled: (enabled: boolean) => Promise<boolean>
  setLanDiscoveryActive: (active: boolean) => Promise<boolean>
  getLocalWebSocketUrl: () => Promise<string>
  showMainWindow: (targetPath?: string) => Promise<boolean>
  showIncomingTransferNotification: (
    request: IncomingTransferNotificationPayload
  ) => Promise<boolean>
  showTransferProgressNotification: (
    progress: TransferProgressNotificationPayload
  ) => Promise<boolean>
  showTransferCompletedNotification: (
    summary: TransferCompletedNotificationPayload
  ) => Promise<boolean>
  saveReceivedFilesToDownloads: (
    files: ReceivedFileSavePayload[]
  ) => Promise<ReceivedFileSaveResult>
  onLanReceivers: (
    listener: (receivers: LanReceiverService[]) => void
  ) => () => void
  onLanDiscoveryError: (
    listener: (error: LanDiscoveryErrorPayload) => void
  ) => () => void
  onReceiverEnabledChanged: (listener: (enabled: boolean) => void) => () => void
  onNavigateRequest: (listener: (targetPath: string) => void) => () => void
  onIncomingTransferNotificationAction: (
    listener: (payload: IncomingTransferNotificationActionPayload) => void
  ) => () => void
  onRuntimeResume: (listener: (payload: RuntimeResumePayload) => void) => () => void
}

// ─── Helper: create a synchronous-returning event subscription ───────────────
// Tauri's listen() is async. We return a cleanup function immediately and
// store the unsubscribe function when the promise resolves.

function makeListener<T>(
  eventName: string,
  listener: (data: T) => void
): () => void {
  let unlisten: UnlistenFn | undefined
  let cancelled = false

  listen<T>(eventName, (event) => {
    // event.payload is the actual data (Tauri v2 standard)
    listener(event.payload)
  }).then((fn) => {
    if (cancelled) {
      fn() // immediately unsubscribe if caller already cleaned up
    } else {
      unlisten = fn
    }
  })

  return () => {
    cancelled = true
    unlisten?.()
  }
}

// ─── Tauri IPC Bridge (drop-in replacement for window.orbitalShareDesktop) ───

const tauriApi: AirSpaceDesktopApi = {
  // ── Invokable commands ──

  getLanReceivers: () =>
    invoke<LanReceiverService[]>("get_lan_receivers"),

  getLanDiscoveryError: () =>
    invoke<LanDiscoveryErrorPayload | null>("get_lan_discovery_error"),

  setReceiverPresence: (presence) =>
    invoke<boolean>("set_receiver_presence", { presence }),

  getReceiverEnabled: () =>
    invoke<boolean>("get_receiver_enabled"),

  setReceiverEnabled: (enabled) =>
    invoke<boolean>("set_receiver_enabled", { enabled }),

  setLanDiscoveryActive: (active) =>
    invoke<boolean>("set_lan_discovery_active", { active }),

  getLocalWebSocketUrl: () =>
    invoke<string>("get_local_websocket_url"),

  showMainWindow: (targetPath) =>
    invoke<boolean>("show_main_window", { targetPath: targetPath ?? null }),

  showIncomingTransferNotification: (request) =>
    invoke<boolean>("show_incoming_transfer_notification", { request }),

  showTransferProgressNotification: (progress) =>
    invoke<boolean>("show_transfer_progress_notification", { progress }),

  showTransferCompletedNotification: (summary) =>
    invoke<boolean>("show_transfer_completed_notification", { summary }),

  saveReceivedFilesToDownloads: async (files) => {
    // Convert ArrayBuffer → number[] for Tauri serialization
    const serialized = files.map((f) => ({
      name: f.name,
      type: f.type,
      bytes: Array.from(new Uint8Array(f.bytes)),
    }))
    return invoke<ReceivedFileSaveResult>("save_received_files_to_downloads", {
      files: serialized,
    })
  },

  // ── Event listeners ──
  // Each returns a cleanup function, identical to the Electron preload contract.
  // Internally, event.payload is unwrapped before calling the user listener.

  onLanReceivers: (listener) =>
    makeListener<LanReceiverService[]>("lan-receivers", listener),

  onLanDiscoveryError: (listener) =>
    makeListener<LanDiscoveryErrorPayload>("lan-discovery-error", listener),

  onReceiverEnabledChanged: (listener) =>
    makeListener<boolean>("receiver-enabled-changed", listener),

  onNavigateRequest: (listener) =>
    makeListener<string>("navigate", listener),

  onIncomingTransferNotificationAction: (listener) =>
    makeListener<IncomingTransferNotificationActionPayload>(
      "incoming-transfer-action",
      listener
    ),

  onRuntimeResume: (listener) =>
    makeListener<RuntimeResumePayload>("runtime-resume", listener),
}

// ─── Public API (same shape as old electron.ts) ───────────────────────────────

/**
 * Returns the desktop API backed by Tauri v2.
 * Previously returned window.orbitalShareDesktop (Electron preload).
 * Function signature is unchanged — all React components work without modification.
 */
export function getDesktopApi(): AirSpaceDesktopApi | null {
  return tauriApi
}

/**
 * Always false in Tauri context.
 * Kept for backward compatibility with any isElectron() guards in the codebase.
 */
export function isElectron(): boolean {
  // Always true in Tauri desktop context.
  // This enables h-screen/w-screen layout in AppWindow instead of the
  // browser-preview fixed 1080×760 box.
  return true
}

/**
 * Fallback WebSocket URL used if getLocalWebSocketUrl() command is unavailable.
 */
export function getLocalWebSocketUrlFallback(): string {
  return "ws://127.0.0.1:8080"
}
