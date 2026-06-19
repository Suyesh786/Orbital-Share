import { create } from "zustand"
import { computeTotalTransferSize } from "@/store/transferUtils"
import { websocketService, type WebSocketHandlers } from "@/services/websocket"
import { capDiscoveryReceivers } from "@/lib/wsDefensiveGuards"
import {
  patchNearbyDevicesTrust,
  mapLanReceiversToDiscoveryEntries,
  reconcileReceiversToNearbyDevices,
} from "@/utils/discovery"
import { clearDiscoveryLayoutRegistry } from "@/lib/discoveryLayoutRegistry"
import { invoke } from "@tauri-apps/api/core"
import type { ReceiverDiscoveryEntry } from "@/types/websocket"
import {
  buildInitialPerFileProgress,
  patchPerFileProgress,
} from "@/lib/perFileTransferProgress"
import {
  decodeFileChunk,
} from "@/lib/transferBinaryProtocol"
import {
  computeTransferMetrics,
  resetProgressMetricsSample,
} from "@/lib/transferProgressMetrics"
import {
  buildOutgoingTransferFiles,
  streamOutgoingFiles,
  toMetadataEntries,
} from "@/services/fileTransferSender"
import {
  canAcceptIncomingRequest,
  canApplySessionStatus,
  canProcessFileChunk,
  canProcessTransferMetadata,
  canStartOutgoingRequest,
  shouldIgnoreStaleTransferId,
} from "@/lib/transferSessionLifecycle"
import { PARTIAL_TRANSFER_CLEAR } from "@/lib/transferCleanup"
import { validateTransferMetadata } from "@/lib/transferMetadataValidation"
import { OUTGOING_REQUEST_TIMEOUT_MS } from "@/lib/transferLimits"
import {
  humanizeCloseReason,
  humanizeRejectReason,
  TRANSFER_USER_MESSAGES,
} from "@/lib/transferUserMessages"
import {
  shouldRejectTransferEvent,
  validateAcceptedSessionIdentity,
} from "@/lib/transferEventSecurity"
import { buildSessionIdentity } from "@/lib/transferSessionIdentity"
import { incrementInteractionCount } from "@/lib/trustedDevices"
import { enqueueTrustSuggestion } from "@/store/useTrustInboxStore"
import {
  logLifecycleReset,
  logReconstructReset,
  logRoleSwap,
  logSessionReleased,
  logTransferFinalized,
  type LifecycleResetOptions,
  type LifecycleResetReason,
} from "@/lib/transferLifecycleReset"
import {
  validateActiveSelection,
  validateFilesToAdd,
} from "@/lib/validateSelectedFiles"
import type {
  AppMode,
  ConnectionStatus,
  IncomingTransferRequest,
  NearbyDevice,
  PerFileTransferProgress,
  PendingOutgoingRequest,
  RegistrationMode,
  SelectedFile,
  TransferFileMetadata,
  TransferPeer,
  TransferSessionStatus,
  TransferState,
  WebSocketConnectionStatus,
  CompletionSummary,
} from "@/types/device"
import type {
  TransferRequestAcceptedPayload,
  TransferRequestRejectedPayload,
  TransferSessionClosedPayload,
  TransferSessionCompletedPayload,
  TransferSessionFailedPayload,
  TransferMetadataPayload,
} from "@/types/websocket"
import { getActiveSelectedFiles } from "@/store/transferUtils"
import {
  detectLocalDeviceMetadata,
  getOrCreateDeviceId,
  loadPersistedDeviceState,
  setOnboardingComplete,
  setStoredUsername,
  validateUsername,
} from "@/utils/device"
import {
  getDesktopApi,
  getLocalWebSocketUrlFallback,
  isElectron,
  type LanReceiverService,
} from "@/lib/electron"

interface TransferStoreState {
  // Identity
  username: string
  deviceId: string
  onboardingCompleted: boolean
  isHydrated: boolean

  // App mode
  mode: AppMode

  // Discovery
  discoverable: boolean
  nearbyDevices: NearbyDevice[]
  selectedReceiver: NearbyDevice | null

  // Files
  selectedFiles: SelectedFile[]
  totalTransferSize: number

  // Transfer
  transferState: TransferState
  transferProgress: number
  transferSpeed: number
  estimatedTimeRemaining: number
  bytesTransferred: number
  activeTransferTotalBytes: number
  perFileTransferProgress: Record<string, PerFileTransferProgress>
  perFileProgressOrder: string[]
  selectedCompletedFileIds: Record<string, boolean>
  isFinalizingTransfer: boolean
  isReconstructingFiles: boolean
  receivedFilesSavedToDownloads: boolean
  receivedFilesSaveDirectory: string | null
  receivedFilesSaveError: string | null

  // Transfer requests (Phase 2.4)
  incomingTransferRequest: IncomingTransferRequest | null
  pendingOutgoingRequest: PendingOutgoingRequest | null
  transferRejectionMessage: string | null
  transferNoticeMessage: string | null
  activeTransferPeer: TransferPeer | null
  incomingFilesMetadata: TransferFileMetadata[]

  // Transfer session (Phase 2.5 — server-authoritative)
  activeTransferId: string
  activeTransferSessionToken: string
  transferSessionStatus: TransferSessionStatus | null
  transferStartedAt: number | null

  // Completion snapshot (immutable — survives session cleanup)
  completionSummary: CompletionSummary | null

  // Connection (transfer / discovery session)
  connectionStatus: ConnectionStatus

  // WebSocket (realtime server link)
  wsConnectionStatus: WebSocketConnectionStatus
  wsSocketId: string
  registeredMode: RegistrationMode | "none"
  lastWsEvent: string

  // Identity actions
  initialize: () => void
  completeOnboarding: (username: string) => boolean
  renameUsername: (username: string) => boolean

  // Session actions
  setMode: (mode: AppMode) => void
  startSendFlow: () => void
  startReceiveFlow: () => void
  startDiscovery: () => void
  discoverReceivers: () => void
  clearNearbyDevices: () => void
  applyReceiversList: (receivers: ReceiverDiscoveryEntry[]) => void
  applyLanReceiverServices: (receivers: LanReceiverService[]) => void
  refreshTrustedNearbyDevices: () => void
  requestTransferToReceiver: (device: NearbyDevice) => Promise<void>
  cancelOutgoingTransferRequest: () => void
  acceptIncomingTransferRequest: () => void
  rejectIncomingTransferRequest: () => void
  setNearbyDevices: (devices: NearbyDevice[]) => void
  setDiscoverable: (discoverable: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setWsConnectionStatus: (status: WebSocketConnectionStatus) => void
  connectWebSocket: () => void
  disconnectWebSocket: () => void
  registerDevice: () => void
  syncReceiverEnabledFromDesktop: (enabled: boolean) => void

  // File actions
  setSelectedFiles: (files: SelectedFile[]) => void
  addFiles: (incoming: File[]) => void
  toggleFile: (id: string) => void
  clearSelectedFiles: () => void
  syncFileTotals: () => void

  // Transfer actions
  setTransferState: (state: TransferState) => void
  setTransferProgress: (progress: number) => void
  setTransferMetrics: (metrics: {
    progress?: number
    speed?: number
    estimatedTimeRemaining?: number
  }) => void
  clearTransferRequestState: () => void
  applyTransferAccepted: (payload: TransferRequestAcceptedPayload) => void
  applyTransferRejected: (payload: TransferRequestRejectedPayload) => void
  applyTransferSessionClosed: (payload: TransferSessionClosedPayload) => void
  applyTransferSessionFailed: (payload: TransferSessionFailedPayload) => void
  applyTransferSessionCompleted: (payload: TransferSessionCompletedPayload) => void
  notifyTransferComplete: () => void
  setCompletionSummary: (summary: CompletionSummary | null) => void
  clearCompletionSummary: () => void
  finalizeLocalTransferSession: () => void
  completeTransferAndExit: () => void
  exitActiveTransferSession: () => void
  abortActiveTransferSession: (userMessage?: string) => void
  startOutgoingFileTransfer: () => Promise<void>
  applyTransferMetadata: (payload: TransferMetadataPayload) => void
  applyFileChunk: (chunk: ReturnType<typeof decodeFileChunk>) => void
  finalizeDirectToDiskTransfer: () => void
  downloadAllReceivedFiles: () => number
  downloadSelectedReceivedFiles: () => number
  toggleCompletedFileSelection: (fileId: string) => void
  resetDiscovery: () => void
  resetTransferProgress: () => void
  exitTransferToDiscovery: () => void
  exitReceiverMode: () => void
  resetTransferSession: () => void
  resetTransferFlow: () => void
}

const initialTransferSession = {
  mode: "idle" as AppMode,
  discoverable: false,
  nearbyDevices: [] as NearbyDevice[],
  selectedReceiver: null as NearbyDevice | null,
  selectedFiles: [] as SelectedFile[],
  totalTransferSize: 0,
  transferState: "idle" as TransferState,
  transferProgress: 0,
  transferSpeed: 0,
  estimatedTimeRemaining: 0,
  bytesTransferred: 0,
  activeTransferTotalBytes: 0,
  perFileTransferProgress: {} as Record<string, PerFileTransferProgress>,
  perFileProgressOrder: [] as string[],
  selectedCompletedFileIds: {} as Record<string, boolean>,
  isFinalizingTransfer: false,
  isReconstructingFiles: false,
  receivedFilesSavedToDownloads: false,
  receivedFilesSaveDirectory: null as string | null,
  receivedFilesSaveError: null as string | null,
  incomingTransferRequest: null as IncomingTransferRequest | null,
  pendingOutgoingRequest: null as PendingOutgoingRequest | null,
  transferRejectionMessage: null as string | null,
  transferNoticeMessage: null as string | null,
  activeTransferPeer: null as TransferPeer | null,
  incomingFilesMetadata: [] as TransferFileMetadata[],
  activeTransferId: "",
  activeTransferSessionToken: "",
  transferSessionStatus: null as TransferSessionStatus | null,
  transferStartedAt: null as number | null,
  completionSummary: null as CompletionSummary | null,
  connectionStatus: "offline" as ConnectionStatus,
}

let wsStatusUnsubscribe: (() => void) | null = null
let rejectionClearTimer: ReturnType<typeof setTimeout> | null = null
let transferCompleteSentForId = ""
let outgoingRequestTimeout: ReturnType<typeof setTimeout> | null = null
let incomingAcceptInFlight = false
let pendingAcceptRequesterSocketId: string | null = null
let outgoingStreamAborted = false

function clearOutgoingRequestTimeout() {
  if (outgoingRequestTimeout) {
    clearTimeout(outgoingRequestTimeout)
    outgoingRequestTimeout = null
  }
}

function clearIncomingAcceptGuard() {
  incomingAcceptInFlight = false
  pendingAcceptRequesterSocketId = null
}

/**
 * Authoritative reset of module-level transfer runtime flags.
 * Must run before every new session and after every terminal session end.
 */
function resetEntireTransferLifecycle(
  reason: LifecycleResetReason,
  options?: LifecycleResetOptions
) {
  logLifecycleReset(reason)
  clearRejectionTimer()
  clearOutgoingRequestTimeout()
  clearIncomingAcceptGuard()
  transferCompleteSentForId = ""
  outgoingTransferInFlight = false
  outgoingStreamAborted = options?.abortOutgoing === true
  resetProgressMetricsSample()
  logReconstructReset()
}

function scheduleOutgoingRequestTimeout(
  set: typeof useTransferStore.setState,
  get: typeof useTransferStore.getState
) {
  clearOutgoingRequestTimeout()
  outgoingRequestTimeout = setTimeout(() => {
    outgoingRequestTimeout = null
    const state = get()
    if (!state.pendingOutgoingRequest || state.mode !== "sender") return
    get().cancelOutgoingTransferRequest()
    set({
      transferRejectionMessage: TRANSFER_USER_MESSAGES.requestTimedOut,
    })
    scheduleRejectionClear(set)
  }, OUTGOING_REQUEST_TIMEOUT_MS)
}

function buildOutgoingFileMetadata(files: SelectedFile[]): TransferFileMetadata[] {
  return getActiveSelectedFiles(files).map((entry) => ({
    name: entry.file.name,
    size: entry.file.size,
    type: entry.file.type || "application/octet-stream",
  }))
}

function buildCompletionSnapshot(state: {
  mode: AppMode
  selectedFiles: SelectedFile[]
  incomingFilesMetadata: TransferFileMetadata[]
  activeTransferPeer: TransferPeer | null
  selectedReceiver: NearbyDevice | null
}): CompletionSummary {
  const isSender = state.mode === "sender"

  if (isSender) {
    const activeFiles = getActiveSelectedFiles(state.selectedFiles)
    return {
      mode: "sender",
      fileCount: activeFiles.length,
      totalBytes: activeFiles.reduce((sum, entry) => sum + entry.file.size, 0),
      fileNames: activeFiles.map((entry) => entry.file.name),
      peerUsername:
        state.activeTransferPeer?.username ?? state.selectedReceiver?.username,
    }
  }

  const files = state.incomingFilesMetadata
  return {
    mode: "receiver",
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    fileNames: files.map((file) => file.name),
    peerUsername: state.activeTransferPeer?.username,
  }
}

function clearRejectionTimer() {
  if (rejectionClearTimer) {
    clearTimeout(rejectionClearTimer)
    rejectionClearTimer = null
  }
}

function scheduleRejectionClear(set: typeof useTransferStore.setState) {
  clearRejectionTimer()
  rejectionClearTimer = setTimeout(() => {
    rejectionClearTimer = null
    set({ transferRejectionMessage: null })
  }, 4500)
}

const SESSION_CLEAR_FIELDS = {
  activeTransferId: "",
  activeTransferSessionToken: "",
  transferSessionStatus: null as TransferSessionStatus | null,
  transferStartedAt: null as number | null,
  activeTransferPeer: null as TransferPeer | null,
  incomingFilesMetadata: [] as TransferFileMetadata[],
} as const

/** Full transfer-prep reset — preserves identity + WebSocket connection */
const TRANSFER_FLOW_RESET_FIELDS = {
  mode: "idle" as AppMode,
  discoverable: false,
  nearbyDevices: [] as NearbyDevice[],
  selectedReceiver: null as NearbyDevice | null,
  selectedFiles: [] as SelectedFile[],
  totalTransferSize: 0,
  transferState: "idle" as TransferState,
  transferProgress: 0,
  transferSpeed: 0,
  estimatedTimeRemaining: 0,
  bytesTransferred: 0,
  activeTransferTotalBytes: 0,
  perFileTransferProgress: {} as Record<string, PerFileTransferProgress>,
  perFileProgressOrder: [] as string[],
  selectedCompletedFileIds: {} as Record<string, boolean>,
  isFinalizingTransfer: false,
  isReconstructingFiles: false,
  receivedFilesSavedToDownloads: false,
  receivedFilesSaveDirectory: null as string | null,
  receivedFilesSaveError: null as string | null,
  incomingTransferRequest: null as IncomingTransferRequest | null,
  pendingOutgoingRequest: null as PendingOutgoingRequest | null,
  transferRejectionMessage: null as string | null,
  transferNoticeMessage: null as string | null,
  completionSummary: null as CompletionSummary | null,
  connectionStatus: "offline" as ConnectionStatus,
  ...SESSION_CLEAR_FIELDS,
} as const

let outgoingTransferInFlight = false

function getLocalWebSocketUrl() {
  return getLocalWebSocketUrlFallback()
}

function buildReceiverWebSocketUrl(device: NearbyDevice) {
  if (!device.host || !device.port) return null
  return `ws://${device.host}:${device.port}`
}

function reconnectElectronRuntimeToLocal(register: () => void) {
  if (!isElectron()) return
  void websocketService.connectToUrl(getLocalWebSocketUrl()).then((connected) => {
    if (connected) {
      register()
    }
  })
}

function setDesktopLanDiscoveryActive(active: boolean) {
  const desktopApi = getDesktopApi()
  if (!desktopApi) return
  void desktopApi.setLanDiscoveryActive(active)
}

function syncDesktopReceiverPresence(state: Pick<
  TransferStoreState,
  | "mode"
  | "discoverable"
  | "deviceId"
  | "username"
  | "onboardingCompleted"
  | "registeredMode"
  | "wsConnectionStatus"
>) {
  const desktopApi = getDesktopApi()
  if (!desktopApi) return

  if (
    state.mode !== "receiver" ||
    !state.discoverable ||
    !state.onboardingCompleted ||
    !state.deviceId ||
    !state.username ||
    state.wsConnectionStatus !== "connected" ||
    state.registeredMode !== "receiver"
  ) {
    void desktopApi.setReceiverPresence({ available: false })
    return
  }

  const metadata = detectLocalDeviceMetadata()

  void desktopApi.setReceiverPresence({
    available: true,
    deviceId: state.deviceId,
    username: state.username,
    deviceType: metadata.deviceType,
    platform: metadata.platform,
  })
}

function applyDiscoveryEntriesToState(
  set: (partial: Partial<TransferStoreState>) => void,
  get: () => TransferStoreState,
  receivers: ReceiverDiscoveryEntry[]
) {
  const state = get()
  const filtered = capDiscoveryReceivers(
    receivers.filter((receiver) => receiver.deviceId !== state.deviceId)
  )
  const nearbyDevices = reconcileReceiversToNearbyDevices(filtered)

  const currentSocketId = state.selectedReceiver?.socketId
  const stillSelected =
    currentSocketId &&
    nearbyDevices.some((device) => device.socketId === currentSocketId)
  const keepRequesting =
    state.transferState === "requesting" && stillSelected

  set({
    nearbyDevices,
    selectedReceiver: stillSelected
      ? (nearbyDevices.find(
          (device) => device.socketId === state.selectedReceiver?.socketId
        ) ?? state.selectedReceiver)
      : null,
    transferState: keepRequesting
      ? "requesting"
      : stillSelected
        ? state.transferState
        : "discovering",
    connectionStatus: keepRequesting
      ? "requesting"
      : stillSelected
        ? state.connectionStatus
        : "searching",
  })
}

async function waitForStoreCondition(
  read: () => boolean,
  timeoutMs = 1500,
  intervalMs = 50
) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (read()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return read()
}

function notifyReceiverTransferProgress(
  state: TransferStoreState,
  progress: number,
  _fileId?: string
) {
  if (!isElectron() || state.mode !== "receiver" || !state.activeTransferId) {
    return
  }

  const desktopApi = getDesktopApi()
  if (!desktopApi) return

  const fileName = state.incomingFilesMetadata[0]?.name

  void desktopApi.showTransferProgressNotification({
    transferId: state.activeTransferId,
    peerUsername: state.activeTransferPeer?.username,
    fileName,
    progress,
  })
}

function notifyReceiverTransferCompleted(
  summary: CompletionSummary,
  transferId: string,
  directory: string | null
) {
  if (!isElectron() || summary.mode !== "receiver") return

  const desktopApi = getDesktopApi()
  if (!desktopApi) return

  void desktopApi.showTransferCompletedNotification({
    transferId,
    fileCount: summary.fileCount,
    directory,
  })
}

export const useTransferStore = create<TransferStoreState>((set, get) => ({
  username: "",
  deviceId: "",
  onboardingCompleted: false,
  isHydrated: false,

  ...initialTransferSession,

  wsConnectionStatus: "offline",
  wsSocketId: "",
  registeredMode: "none",
  lastWsEvent: "none",

  initialize: () => {
    if (get().isHydrated) return

    const deviceId = getOrCreateDeviceId()
    const persisted = loadPersistedDeviceState()

    set({
      deviceId,
      username: persisted.username ?? "",
      onboardingCompleted:
        persisted.onboardingCompleted && Boolean(persisted.username),
      isHydrated: true,
    })
    syncDesktopReceiverPresence(get())
  },

  completeOnboarding: (rawUsername) => {
    const username = validateUsername(rawUsername)
    if (!username) return false

    setStoredUsername(username)
    setOnboardingComplete(true)

    set({
      username,
      onboardingCompleted: true,
    })

    syncDesktopReceiverPresence(get())
    get().registerDevice()
    return true
  },

  renameUsername: (rawUsername) => {
    const username = validateUsername(rawUsername)
    if (!username) return false

    setStoredUsername(username)
    set({ username })
    syncDesktopReceiverPresence(get())
    get().registerDevice()
    return true
  },

  setMode: (mode) => {
    set({ mode })
    syncDesktopReceiverPresence(get())
  },

  startSendFlow: () => {
    const previousMode = get().mode
    resetEntireTransferLifecycle("send_flow")
    setDesktopLanDiscoveryActive(false)
    if (previousMode === "receiver" && import.meta.env.DEV) {
      logRoleSwap("receiver", "sender")
    }
    console.log("[MODE] startSendFlow() → sender")
    set({
      mode: "sender",
      transferState: "idle",
      connectionStatus: "offline",
      discoverable: false,
      selectedReceiver: null,
      nearbyDevices: [],
      selectedFiles: [],
      totalTransferSize: 0,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      transferNoticeMessage: null,
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      bytesTransferred: 0,
      activeTransferTotalBytes: 0,
      completionSummary: null,
      perFileTransferProgress: {},
      perFileProgressOrder: [],
      selectedCompletedFileIds: {},
      ...SESSION_CLEAR_FIELDS,
    })
    syncDesktopReceiverPresence(get())
    get().connectWebSocket()
    void websocketService.connectToUrl(getLocalWebSocketUrl()).then((connected) => {
      if (connected) {
        get().registerDevice()
      }
    })
  },

  startReceiveFlow: () => {
    const previousMode = get().mode
    resetEntireTransferLifecycle("receive_flow")
    setDesktopLanDiscoveryActive(false)
    if (previousMode === "sender" && import.meta.env.DEV) {
      logRoleSwap("sender", "receiver")
    }
    console.log("[MODE] startReceiveFlow() → receiver")
    set({
      mode: "receiver",
      discoverable: true,
      connectionStatus: "searching",
      transferState: "waiting",
      nearbyDevices: [],
      selectedReceiver: null,
      completionSummary: null,
      ...PARTIAL_TRANSFER_CLEAR,
      ...SESSION_CLEAR_FIELDS,
    })
    syncDesktopReceiverPresence(get())
    get().connectWebSocket()
    void websocketService.connectToUrl(getLocalWebSocketUrl()).then((connected) => {
      if (connected) {
        get().registerDevice()
      }
    })
  },

  startDiscovery: () => {
    const state = get()
    const validation = validateActiveSelection(state.selectedFiles)
    if (!validation.valid) {
      set({
        transferNoticeMessage:
          validation.errors[0] ?? TRANSFER_USER_MESSAGES.noFilesSelected,
      })
      return
    }

    resetEntireTransferLifecycle("discovery")
    setDesktopLanDiscoveryActive(isElectron())
    set({
      transferState: "discovering",
      connectionStatus: "searching",
      nearbyDevices: [],
      selectedReceiver: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      transferNoticeMessage: null,
      ...PARTIAL_TRANSFER_CLEAR,
      ...SESSION_CLEAR_FIELDS,
    })
    if (isElectron()) {
      const desktopApi = getDesktopApi()
      if (desktopApi) {
        void desktopApi.getLanReceivers().then((receivers) => {
          useTransferStore.getState().applyLanReceiverServices(receivers)
        })
      }
    } else {
      get().discoverReceivers()
    }
  },

  discoverReceivers: async () => {
    if (isElectron()) return

    const state = get()
    if (state.mode !== "sender") return
    if (state.wsConnectionStatus !== "connected") return

    if (import.meta.env.DEV) {
      console.log("[WS] discoverReceivers()")
    }

    const sent = await websocketService.sendDiscoverReceivers()
    if (sent) {
      set({ lastWsEvent: "discover_receivers" })
    }
  },

  clearNearbyDevices: () => set({ nearbyDevices: [] }),

  applyReceiversList: (receivers) => {
    applyDiscoveryEntriesToState(set, get, receivers)
    set({ lastWsEvent: "receivers_list" })
  },

  applyLanReceiverServices: (receivers) => {
    if (get().mode !== "sender") return
    applyDiscoveryEntriesToState(
      set,
      get,
      mapLanReceiversToDiscoveryEntries(receivers)
    )
  },

  refreshTrustedNearbyDevices: () => {
    const state = get()
    if (!state.nearbyDevices.length) return

    const entries: ReceiverDiscoveryEntry[] = state.nearbyDevices.map(
      (device) => ({
        deviceId: device.id,
        username: device.username,
        socketId: device.socketId,
        mode: "receiver",
      })
    )

    const nearbyDevices = patchNearbyDevicesTrust(state.nearbyDevices, entries)
    const selectedSocketId = state.selectedReceiver?.socketId

    set({
      nearbyDevices,
      selectedReceiver: selectedSocketId
        ? (nearbyDevices.find((d) => d.socketId === selectedSocketId) ??
          state.selectedReceiver)
        : state.selectedReceiver,
    })
  },

  requestTransferToReceiver: async (device) => {
    const state = get()
    if (!canStartOutgoingRequest(state) || !device.socketId) {
      return
    }

    setDesktopLanDiscoveryActive(false)

    if (
      state.pendingOutgoingRequest?.targetSocketId === device.socketId ||
      state.pendingOutgoingRequest?.targetDeviceId === device.id
    ) {
      return
    }

    const selectionCheck = validateActiveSelection(state.selectedFiles)
    if (!selectionCheck.valid) {
      set({
        transferRejectionMessage:
          selectionCheck.errors[0] ?? TRANSFER_USER_MESSAGES.noFilesSelected,
      })
      scheduleRejectionClear(set)
      return
    }

    const files = buildOutgoingFileMetadata(state.selectedFiles)
    if (files.length === 0) return

    let targetSocketId = device.socketId
    let targetDeviceId: string | undefined

    if (isElectron()) {
      const receiverUrl = buildReceiverWebSocketUrl(device)
      if (!receiverUrl) {
        setDesktopLanDiscoveryActive(true)
        set({
          transferRejectionMessage: "Receiver discovery details are missing",
        })
        scheduleRejectionClear(set)
        return
      }

      const connected = await websocketService.connectToUrl(receiverUrl)
      if (!connected) {
        setDesktopLanDiscoveryActive(true)
        reconnectElectronRuntimeToLocal(() => get().registerDevice())
        set({
          wsConnectionStatus: "offline",
          transferRejectionMessage: "Unable to reach that receiver",
        })
        scheduleRejectionClear(set)
        return
      }

      get().registerDevice()

      const registered = await waitForStoreCondition(
        () =>
          get().wsConnectionStatus === "connected" &&
          get().registeredMode === "sender",
        1500
      )

      if (!registered) {
        setDesktopLanDiscoveryActive(true)
        reconnectElectronRuntimeToLocal(() => get().registerDevice())
        set({
          transferRejectionMessage: "Unable to register with that receiver",
        })
        scheduleRejectionClear(set)
        return
      }

      targetSocketId = ""
      targetDeviceId = device.id
    }

    const requestId = crypto.randomUUID()

    set({
      selectedReceiver: device,
      transferState: "requesting",
      connectionStatus: "requesting",
      pendingOutgoingRequest: {
        requestId,
        targetSocketId,
        targetDeviceId,
      },
      transferRejectionMessage: null,
      lastWsEvent: "transfer_request",
    })

    websocketService.sendTransferRequest({
      targetSocketId,
      targetDeviceId,
      senderUsername: get().username,
      senderDeviceId: get().deviceId,
      files,
    })

    scheduleOutgoingRequestTimeout(set, get)
  },

  cancelOutgoingTransferRequest: () => {
    clearOutgoingRequestTimeout()
    const state = get()
    const pending = state.pendingOutgoingRequest

    if (pending && state.wsConnectionStatus === "connected") {
      websocketService.sendTransferCancel({
        targetSocketId: pending.targetSocketId,
        targetDeviceId: pending.targetDeviceId,
      })
    }

    set({
      pendingOutgoingRequest: null,
      selectedReceiver: null,
      transferState: "discovering",
      connectionStatus: "searching",
      lastWsEvent: "transfer_cancel",
    })
    setDesktopLanDiscoveryActive(isElectron())
    reconnectElectronRuntimeToLocal(() => get().registerDevice())
  },

  acceptIncomingTransferRequest: () => {
    const state = get()
    const incoming = state.incomingTransferRequest
    if (!canAcceptIncomingRequest(state) || !incoming) return
    if (incomingAcceptInFlight) return

    incomingAcceptInFlight = true
    pendingAcceptRequesterSocketId = incoming.requesterSocketId

    set({
      incomingTransferRequest: null,
      transferState: "connecting",
      connectionStatus: "connected",
      lastWsEvent: "transfer_accept",
    })

    websocketService.sendTransferAccept({
      requesterSocketId: incoming.requesterSocketId,
    })
  },

  rejectIncomingTransferRequest: () => {
    const state = get()
    const incoming = state.incomingTransferRequest
    if (!incoming || state.mode !== "receiver") return
    if (incomingAcceptInFlight) return

    websocketService.sendTransferReject({
      requesterSocketId: incoming.requesterSocketId,
    })

    set({
      incomingTransferRequest: null,
      lastWsEvent: "transfer_reject",
    })
  },

  clearTransferRequestState: () => {
    resetEntireTransferLifecycle("reject")
    set({
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...PARTIAL_TRANSFER_CLEAR,
      ...SESSION_CLEAR_FIELDS,
    })
  },

  applyTransferAccepted: (payload: TransferRequestAcceptedPayload) => {
    const state = get()
    const wsSocketId = state.wsSocketId
    const isSender = wsSocketId === payload.senderSocketId
    const isReceiver = wsSocketId === payload.receiverSocketId

    if (!isSender && !isReceiver) return

    const identity = buildSessionIdentity(payload, wsSocketId)
    if (!validateAcceptedSessionIdentity(identity, wsSocketId)) {
      if (import.meta.env.DEV) {
        console.warn("[SESSION_GUARD] rejected transfer_request_accepted")
      }
      return
    }

    if (state.activeTransferId === payload.transferId) {
      clearOutgoingRequestTimeout()
      clearIncomingAcceptGuard()
      return
    }

    if (isSender) {
      const canAccept =
        Boolean(state.pendingOutgoingRequest) ||
        (state.transferState === "requesting" &&
          state.selectedReceiver !== null)
      if (!canAccept) return
    } else if (isReceiver) {
      const expectedRequester =
        pendingAcceptRequesterSocketId ??
        state.incomingTransferRequest?.requesterSocketId
      if (
        expectedRequester &&
        expectedRequester !== payload.senderSocketId
      ) {
        return
      }
    }

    clearOutgoingRequestTimeout()
    clearIncomingAcceptGuard()
    resetEntireTransferLifecycle("transfer_accepted")

    const peer: TransferPeer = isSender
      ? {
          socketId: payload.receiverSocketId,
          username: payload.receiverUsername,
          deviceId: payload.receiverDeviceId,
        }
      : {
          socketId: payload.senderSocketId,
          username: payload.senderUsername,
          deviceId: payload.senderDeviceId,
        }

    set({
      ...PARTIAL_TRANSFER_CLEAR,
      pendingOutgoingRequest: null,
      incomingTransferRequest: null,
      transferState: "connecting",
      connectionStatus: "connected",
      activeTransferId: payload.transferId,
      activeTransferSessionToken: payload.sessionToken,
      transferSessionStatus: "connecting",
      transferStartedAt: Date.now(),
      activeTransferPeer: peer,
      incomingFilesMetadata: isReceiver ? payload.files : [],
      activeTransferTotalBytes: payload.totalBytes,
      bytesTransferred: 0,
      perFileTransferProgress: {},
      perFileProgressOrder: [],
      selectedCompletedFileIds: {},
      transferRejectionMessage: null,
      transferNoticeMessage: null,
      isFinalizingTransfer: false,
      isReconstructingFiles: false,
      lastWsEvent: "transfer_request_accepted",
    })

    if (import.meta.env.DEV) {
      logSessionReleased()
      console.log(
        `[SESSION] New transfer ${payload.transferId.slice(0, 8)}… role=${isSender ? "sender" : "receiver"}`
      )
    }

    if (isReceiver) {
      notifyReceiverTransferProgress(get(), 0, "")
    }
  },

  applyTransferSessionClosed: (payload: TransferSessionClosedPayload) => {
    const state = get()
    if (
      shouldRejectTransferEvent(
        {
          activeTransferId: state.activeTransferId,
          activeTransferSessionToken: state.activeTransferSessionToken,
          wsSocketId: state.wsSocketId,
          mode: state.mode,
        },
        payload.transferId
      )
    ) {
      return
    }
    resetEntireTransferLifecycle("session_closed", { abortOutgoing: true })
    logSessionReleased(payload.transferId)

    const message = humanizeCloseReason(payload.reason)
    const isSender = state.mode === "sender"

    get().exitActiveTransferSession()
    set({
      lastWsEvent: "transfer_session_closed",
      transferRejectionMessage: isSender ? message : null,
      transferNoticeMessage: !isSender ? message : null,
    })
    if (isSender) {
      scheduleRejectionClear(set)
    }
  },

  abortActiveTransferSession: (userMessage) => {
    const state = get()
    if (!state.activeTransferId) return

    resetEntireTransferLifecycle("abort", { abortOutgoing: true })
    logSessionReleased(state.activeTransferId)

    if (state.wsConnectionStatus === "connected" && state.activeTransferSessionToken) {
      websocketService.sendTransferAbort({
        transferId: state.activeTransferId,
        sessionToken: state.activeTransferSessionToken,
      })
    }

    const isSender = state.mode === "sender"
    const message = userMessage ?? TRANSFER_USER_MESSAGES.transferCancelled

    set({
      ...PARTIAL_TRANSFER_CLEAR,
      completionSummary: null,
      ...SESSION_CLEAR_FIELDS,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferState: isSender ? "discovering" : "waiting",
      connectionStatus: "searching",
      selectedReceiver: isSender ? null : state.selectedReceiver,
      discoverable: state.discoverable,
      transferRejectionMessage: isSender ? message : null,
      transferNoticeMessage: !isSender ? message : null,
      lastWsEvent: "transfer_abort",
    })

    if (isSender) {
      reconnectElectronRuntimeToLocal(() => get().registerDevice())
      get().discoverReceivers()
      scheduleRejectionClear(set)
    }
  },

  applyTransferSessionFailed: (payload: TransferSessionFailedPayload) => {
    const state = get()
    if (!state.activeTransferId || state.activeTransferId !== payload.transferId) {
      return
    }
    resetEntireTransferLifecycle("failed", { abortOutgoing: true })
    get().exitActiveTransferSession()
    set({
      transferState: "failed",
      transferSessionStatus: "failed",
      lastWsEvent: "transfer_session_failed",
    })
  },

  notifyTransferComplete: async () => {
    const { activeTransferId, wsConnectionStatus, transferSessionStatus, mode } =
      get()
    if (mode !== "receiver") return
    if (!activeTransferId || wsConnectionStatus !== "connected") return
    if (
      transferSessionStatus !== "reconstructing" &&
      transferSessionStatus !== "transferring"
    ) {
      return
    }
    if (transferCompleteSentForId === activeTransferId) return

    const sessionToken = get().activeTransferSessionToken
    if (!sessionToken) return

    const sent = await websocketService.sendTransferComplete({
      transferId: activeTransferId,
      sessionToken,
    })

    if (sent) {
      transferCompleteSentForId = activeTransferId
      set({ lastWsEvent: "transfer_complete" })
    }
  },

  applyTransferMetadata: (payload) => {
    const state = get()
    if (state.mode !== "receiver") return
    if (
      shouldRejectTransferEvent(
        {
          activeTransferId: state.activeTransferId,
          activeTransferSessionToken: state.activeTransferSessionToken,
          wsSocketId: state.wsSocketId,
          mode: state.mode,
        },
        payload.transferId,
        payload.sessionToken
      )
    ) {
      return
    }
    if (
      shouldIgnoreStaleTransferId(
        {
          activeTransferId: state.activeTransferId,
          transferSessionStatus: state.transferSessionStatus,
        },
        payload.transferId
      )
    ) {
      return
    }
    if (
      !canProcessTransferMetadata({
        activeTransferId: state.activeTransferId,
        transferSessionStatus: state.transferSessionStatus,
      })
    ) {
      return
    }

    const metadataCheck = validateTransferMetadata(payload, state.activeTransferId)
    if (!metadataCheck.valid) {
      if (import.meta.env.DEV) {
        console.warn("[GUARD] metadata rejected:", metadataCheck.reason)
      }
      get().abortActiveTransferSession(TRANSFER_USER_MESSAGES.invalidMetadata)
      return
    }

    resetProgressMetricsSample()

    const incomingFilesMetadata: TransferFileMetadata[] = []
    const metadataFiles: Array<{ fileId: string; name: string; size: number }> = []

    for (const file of payload.files) {
      incomingFilesMetadata.push({
        fileId: file.fileId,
        name: file.name,
        size: file.size,
        type: file.type,
      })
      metadataFiles.push({
        fileId: file.fileId,
        name: file.name,
        size: file.size,
      })
      
      if (isElectron()) {
        invoke("init_file_download", {
          fileId: file.fileId,
          fileName: file.name,
        }).catch(console.error)
      }
    }

    const { perFileTransferProgress, perFileProgressOrder } =
      buildInitialPerFileProgress(metadataFiles)

    const nextStatus = "transferring" as const
    if (
      state.transferSessionStatus &&
      !canApplySessionStatus(state.transferSessionStatus, nextStatus)
    ) {
      return
    }

    set({
      incomingFilesMetadata,
      perFileTransferProgress,
      perFileProgressOrder,
      activeTransferTotalBytes: payload.totalBytes,
      bytesTransferred: 0,
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      transferSessionStatus: nextStatus,
      transferState: "transferring",
      lastWsEvent: "transfer_metadata",
    })
  },

  applyFileChunk: async (chunk) => {
    if (!chunk) return

    const state = get()
    if (state.mode !== "receiver") return
    if (
      shouldRejectTransferEvent(
        {
          activeTransferId: state.activeTransferId,
          activeTransferSessionToken: state.activeTransferSessionToken,
          wsSocketId: state.wsSocketId,
          mode: state.mode,
        },
        chunk.transferId
      )
    ) {
      return
    }
    if (
      shouldIgnoreStaleTransferId(
        {
          activeTransferId: state.activeTransferId,
          transferSessionStatus: state.transferSessionStatus,
        },
        chunk.transferId
      )
    ) {
      return
    }
    if (
      !canProcessFileChunk({
        activeTransferId: state.activeTransferId,
        transferSessionStatus: state.transferSessionStatus,
      })
    ) {
      return
    }

    // Direct-to-Disk Stream
    if (isElectron()) {
      try {
        await invoke("append_file_chunk", {
          fileId: chunk.fileId,
          chunk: chunk.data,
        })
      } catch (e) {
        console.error("Failed to append chunk:", e)
        return
      }
    }

    const existingProgress = state.perFileTransferProgress[chunk.fileId]
    if (!existingProgress) return

    const chunkBytes = chunk.data.byteLength
    const receivedBytes = existingProgress.transferredBytes + chunkBytes
    const totalBytes = state.activeTransferTotalBytes
    const bytesTransferred = state.bytesTransferred + chunkBytes

    const metrics = computeTransferMetrics(bytesTransferred, totalBytes)
    const perFileTransferProgress = patchPerFileProgress(
      state.perFileTransferProgress,
      chunk.fileId,
      receivedBytes
    )

    set({
      perFileTransferProgress,
      bytesTransferred,
      transferProgress: metrics.progress,
      transferSpeed: metrics.speed,
      estimatedTimeRemaining: metrics.estimatedTimeRemaining,
      transferState: "transferring",
      transferSessionStatus: "transferring",
    })

    notifyReceiverTransferProgress(
      get(),
      metrics.progress,
      chunk.fileId
    )

    const isFileComplete = receivedBytes >= existingProgress.totalBytes
    if (isFileComplete && isElectron()) {
      invoke("finalize_file_download", { fileId: chunk.fileId }).catch(console.error)
    }

    const allFilesComplete = Object.values(perFileTransferProgress).every((p) => p.percentage >= 100)
    if (allFilesComplete) {
      get().finalizeDirectToDiskTransfer()
    }
  },

  finalizeDirectToDiskTransfer: () => {
    const state = get()
    if (state.mode !== "receiver") return
    if (!state.activeTransferId) return

    set({
      transferProgress: 100,
      bytesTransferred: state.activeTransferTotalBytes,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      isFinalizingTransfer: false,
      isReconstructingFiles: false,
      receivedFilesSavedToDownloads: true,
      receivedFilesSaveDirectory: "Downloads",
      receivedFilesSaveError: null,
    })

    get().notifyTransferComplete()
  },

  downloadAllReceivedFiles: () => {
    return 0
  },

  downloadSelectedReceivedFiles: () => {
    return 0
  },

  toggleCompletedFileSelection: (fileId) => {
    const current = get().selectedCompletedFileIds[fileId] ?? false
    set({
      selectedCompletedFileIds: {
        ...get().selectedCompletedFileIds,
        [fileId]: !current,
      },
    })
  },

  startOutgoingFileTransfer: async () => {
    const state = get()
    if (state.mode !== "sender" || !state.activeTransferId) return
    if (!state.activeTransferSessionToken) return
    if (state.transferSessionStatus !== "connecting" || outgoingTransferInFlight) {
      return
    }

    const activeFiles = getActiveSelectedFiles(state.selectedFiles)
    if (activeFiles.length === 0) return

    const selectionCheck = validateActiveSelection(state.selectedFiles)
    if (!selectionCheck.valid) {
      set({
        transferRejectionMessage:
          selectionCheck.errors[0] ?? TRANSFER_USER_MESSAGES.noFilesSelected,
      })
      scheduleRejectionClear(set)
      return
    }

    outgoingTransferInFlight = true
    outgoingStreamAborted = false
    resetProgressMetricsSample()

    const outgoing = buildOutgoingTransferFiles(activeFiles.map((entry) => entry.file))
    const totalBytes = outgoing.reduce((sum, entry) => sum + entry.size, 0)
    const { perFileTransferProgress, perFileProgressOrder } =
      buildInitialPerFileProgress(
        outgoing.map((entry) => ({
          fileId: entry.fileId,
          name: entry.name,
          size: entry.size,
        }))
      )

    set({
      transferSessionStatus: "metadata",
      transferState: "transferring",
      activeTransferTotalBytes: totalBytes,
      bytesTransferred: 0,
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      perFileTransferProgress,
      perFileProgressOrder,
    })

    const metadataSent = await websocketService.sendTransferMetadata({
      transferId: state.activeTransferId,
      sessionToken: state.activeTransferSessionToken,
      files: toMetadataEntries(outgoing),
      totalBytes,
    })

    if (!metadataSent) {
      outgoingTransferInFlight = false
      return
    }

    set({
      transferSessionStatus: "transferring",
      lastWsEvent: "transfer_metadata",
    })

    const streamResult = await streamOutgoingFiles(
      state.activeTransferId,
      outgoing,
      ({ bytesSent, totalBytes, fileId, fileBytesSent }) => {
        if (outgoingStreamAborted || !get().activeTransferId) return

        const metrics = computeTransferMetrics(bytesSent, totalBytes)
        const current = get()
        set({
          bytesTransferred: bytesSent,
          activeTransferTotalBytes: totalBytes,
          transferProgress: metrics.progress,
          transferSpeed: metrics.speed,
          estimatedTimeRemaining: metrics.estimatedTimeRemaining,
          transferState: "transferring",
          transferSessionStatus: "transferring",
          perFileTransferProgress: patchPerFileProgress(
            current.perFileTransferProgress,
            fileId,
            fileBytesSent
          ),
        })
      },
      {
        shouldAbort: () =>
          outgoingStreamAborted || !get().activeTransferId,
      }
    )

    outgoingTransferInFlight = false

    if (streamResult === "aborted" || outgoingStreamAborted) {
      return
    }
  },

  setCompletionSummary: (summary) => set({ completionSummary: summary }),

  clearCompletionSummary: () => set({ completionSummary: null }),

  finalizeLocalTransferSession: () => {
    const state = get()
    const isSender = state.mode === "sender"
    const peer = state.activeTransferPeer
    const transferId = state.activeTransferId

    if (peer?.deviceId) {
      incrementInteractionCount(peer.deviceId, peer.username, transferId)
      enqueueTrustSuggestion(
        peer.deviceId,
        peer.username,
        isSender ? "sender" : "receiver"
      )
    }
    const completionSummary = buildCompletionSnapshot(state)

    const selectedCompletedFileIds: Record<string, boolean> = {}

    if (transferId) {
      logTransferFinalized(transferId, isSender ? "sender" : "receiver")
      logSessionReleased(transferId)
    }

    if (transferId && !isSender) {
      notifyReceiverTransferCompleted(
        completionSummary,
        transferId,
        state.receivedFilesSaveDirectory
      )
    }

    resetEntireTransferLifecycle("finalize", { abortOutgoing: true })

    set({
      completionSummary,
      selectedCompletedFileIds,
      ...SESSION_CLEAR_FIELDS,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      isFinalizingTransfer: false,
      isReconstructingFiles: false,
      transferProgress: 100,
      transferState: "completed",
      connectionStatus: "searching",
      selectedReceiver: isSender ? null : state.selectedReceiver,
      discoverable: state.discoverable,
    })
  },

  applyTransferSessionCompleted: (payload: TransferSessionCompletedPayload) => {
    const state = get()
    if (state.transferState === "completed" && state.completionSummary) {
      if (import.meta.env.DEV) {
        console.log("[SESSION_GUARD] transfer_session_completed ignored (already finalized)")
      }
      return
    }

    if (
      shouldRejectTransferEvent(
        {
          activeTransferId: state.activeTransferId,
          activeTransferSessionToken: state.activeTransferSessionToken,
          wsSocketId: state.wsSocketId,
          mode: state.mode,
        },
        payload.transferId,
        payload.sessionToken
      )
    ) {
      if (import.meta.env.DEV) {
        console.warn(
          "[SESSION_GUARD] rejected transfer_session_completed",
          payload.transferId.slice(0, 8)
        )
      }
      return
    }

    get().finalizeLocalTransferSession()
    set({ lastWsEvent: "transfer_session_completed" })
  },

  resetTransferFlow: () => {
    const state = get()
    const previousMode = state.mode
    setDesktopLanDiscoveryActive(false)
    if (
      state.activeTransferId &&
      state.activeTransferSessionToken &&
      state.wsConnectionStatus === "connected"
    ) {
      websocketService.sendTransferAbort({
        transferId: state.activeTransferId,
        sessionToken: state.activeTransferSessionToken,
      })
    }
    resetEntireTransferLifecycle("reset", { abortOutgoing: true })
    console.log("[RESET] resetTransferFlow()", {
      previousMode,
      nextMode: "idle",
    })
    set({
      ...TRANSFER_FLOW_RESET_FIELDS,
      ...PARTIAL_TRANSFER_CLEAR,
      registeredMode: "none",
    })
    syncDesktopReceiverPresence(get())
    get().disconnectWebSocket()
  },

  completeTransferAndExit: () => {
    get().resetTransferFlow()
  },

  exitActiveTransferSession: () => {
    const state = get()
    const isSender = state.mode === "sender"

    resetEntireTransferLifecycle("exit", { abortOutgoing: true })
    set({
      ...PARTIAL_TRANSFER_CLEAR,
      completionSummary: null,
      ...SESSION_CLEAR_FIELDS,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferState: isSender ? "discovering" : "waiting",
      connectionStatus: "searching",
      selectedReceiver: isSender ? null : state.selectedReceiver,
      discoverable: state.discoverable,
    })

    if (isSender) {
      reconnectElectronRuntimeToLocal(() => get().registerDevice())
      get().discoverReceivers()
    }
  },

  applyTransferRejected: (payload: TransferRequestRejectedPayload) => {
    const state = get()
    if (state.mode !== "sender" || state.transferState !== "requesting") {
      return
    }
    if (payload.requesterSocketId !== state.wsSocketId) {
      return
    }

    clearOutgoingRequestTimeout()

    const message = humanizeRejectReason(payload.reason)

    set({
      pendingOutgoingRequest: null,
      selectedReceiver: null,
      transferState: "discovering",
      connectionStatus: "searching",
      transferRejectionMessage: message,
      lastWsEvent: "transfer_request_rejected",
    })

    setDesktopLanDiscoveryActive(isElectron())
    reconnectElectronRuntimeToLocal(() => get().registerDevice())
    scheduleRejectionClear(set)
  },

  setNearbyDevices: (devices) => set({ nearbyDevices: devices }),

  setDiscoverable: (discoverable) => {
    set({ discoverable })
    syncDesktopReceiverPresence(get())
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setWsConnectionStatus: (wsConnectionStatus) => set({ wsConnectionStatus }),

  connectWebSocket: () => {
    if (wsStatusUnsubscribe) return

    wsStatusUnsubscribe = websocketService.subscribeStatus((status) => {
      set({ wsConnectionStatus: status })
    })

    const handlers: WebSocketHandlers = {
      onOpen: () => {
        set({ wsConnectionStatus: "connected" })
        get().registerDevice()
      },
      onClose: () => {
        resetEntireTransferLifecycle("ws_close", { abortOutgoing: true })
        const state = get()
        const hadActiveSession = Boolean(state.activeTransferId)
        const wasRequesting = state.transferState === "requesting"

        set({
          wsConnectionStatus: "offline",
          wsSocketId: "",
          registeredMode: "none",
          incomingTransferRequest: null,
          pendingOutgoingRequest: null,
          transferRejectionMessage: null,
          transferNoticeMessage: null,
          ...PARTIAL_TRANSFER_CLEAR,
          ...SESSION_CLEAR_FIELDS,
          transferState: wasRequesting
            ? "discovering"
            : hadActiveSession
              ? state.mode === "sender"
                ? "discovering"
                : "waiting"
              : state.transferState,
          connectionStatus: wasRequesting
            ? "searching"
            : hadActiveSession
              ? "searching"
              : state.connectionStatus,
          selectedReceiver: wasRequesting ? null : state.selectedReceiver,
        })
        syncDesktopReceiverPresence(get())
      },
      onError: () => {
        const status = websocketService.getStatus()
        if (status !== "connected") {
          set({ wsConnectionStatus: status === "connecting" ? "connecting" : "offline" })
        }
      },
      onConnected: (socketId) => {
        const mode = get().mode
        console.log("[WS] onConnected — registerDevice()", {
          socketId: socketId.slice(0, 8),
          mode,
        })
        set({ wsSocketId: socketId })
        get().registerDevice()
      },
      onRegistered: (mode) => {
        set({ registeredMode: mode, lastWsEvent: "registered" })
        syncDesktopReceiverPresence(get())
      },
      onServerNotice: (message) => {
        set({ transferNoticeMessage: message })
      },
      onReceiversList: (receivers) => {
        get().applyReceiversList(receivers)
      },
      onReceiversUpdated: () => {
        if (import.meta.env.DEV) {
          console.log("[WS] receivers_updated received")
        }

        set({ lastWsEvent: "receivers_updated" })
        const state = get()
        if (
          state.mode !== "sender" ||
          state.transferState !== "discovering" ||
          state.wsConnectionStatus !== "connected"
        ) {
          return
        }

        get().discoverReceivers()
      },
      onIncomingTransferRequest: (payload) => {
        const state = get()
        if (state.mode !== "receiver") return

        if (state.activeTransferId) {
          websocketService.sendTransferReject({
            requesterSocketId: payload.requesterSocketId,
          })
          return
        }

        if (state.transferState !== "waiting") {
          set({
            transferState: "waiting",
            connectionStatus: "searching",
            completionSummary: null,
          })
        }

        if (state.incomingTransferRequest) {
          websocketService.sendTransferReject({
            requesterSocketId: payload.requesterSocketId,
          })
          return
        }

        const incoming: IncomingTransferRequest = {
          requestId: payload.requestId,
          requesterSocketId: payload.requesterSocketId,
          senderUsername: payload.senderUsername,
          senderDeviceId: payload.senderDeviceId,
          files: payload.files,
          fileCount: payload.fileCount,
          totalSize: payload.totalSize,
          timestamp: payload.timestamp,
        }

        set({
          incomingTransferRequest: incoming,
          lastWsEvent: "incoming_transfer_request",
        })

        const desktopApi = getDesktopApi()
        if (desktopApi) {
          void desktopApi.showIncomingTransferNotification({
            senderUsername: incoming.senderUsername,
            requesterSocketId: incoming.requesterSocketId,
            fileCount: incoming.fileCount,
          })
        }
      },
      onTransferRequestAccepted: (payload) => {
        get().applyTransferAccepted(payload)
      },
      onTransferRequestRejected: (payload) => {
        get().applyTransferRejected(payload)
      },
      onTransferRequestCancelled: () => {
        const state = get()
        if (state.mode !== "receiver") return
        clearIncomingAcceptGuard()
        set({
          incomingTransferRequest: null,
          transferState: state.activeTransferId ? state.transferState : "waiting",
          connectionStatus: state.activeTransferId
            ? state.connectionStatus
            : "searching",
          lastWsEvent: "transfer_request_cancelled",
        })
      },
      onTransferSessionClosed: (payload) => {
        get().applyTransferSessionClosed(payload)
      },
      onTransferSessionFailed: (payload) => {
        get().applyTransferSessionFailed(payload)
      },
      onTransferSessionCompleted: (payload) => {
        get().applyTransferSessionCompleted(payload)
      },
      onTransferMetadata: (payload) => {
        get().applyTransferMetadata(payload)
      },
      onBinaryMessage: (data) => {
        get().applyFileChunk(decodeFileChunk(data))
      },
    }

    if (isElectron()) {
      websocketService.setHandlers(handlers)
    } else {
      websocketService.connect(handlers)
    }

    const current = websocketService.getStatus()
    if (current !== get().wsConnectionStatus) {
      set({ wsConnectionStatus: current })
    }
  },

  disconnectWebSocket: () => {
    wsStatusUnsubscribe?.()
    wsStatusUnsubscribe = null
    websocketService.disconnect()
    set({
      wsConnectionStatus: "offline",
      wsSocketId: "",
      registeredMode: "none",
      lastWsEvent: "offline",
      nearbyDevices: [],
    })
  },

  syncReceiverEnabledFromDesktop: (enabled) => {
    const state = get()

    if (enabled) {
      if (state.mode !== "receiver" || !state.discoverable) {
        get().startReceiveFlow()
        return
      }

      if (state.wsConnectionStatus !== "connected") {
        void websocketService.connectToUrl(getLocalWebSocketUrl()).then((connected) => {
          if (connected) {
            get().registerDevice()
          }
        })
      }
      return
    }

    if (state.incomingTransferRequest && state.wsConnectionStatus === "connected") {
      websocketService.sendTransferReject({
        requesterSocketId: state.incomingTransferRequest.requesterSocketId,
      })
    }

    if (state.activeTransferId) {
      set({
        discoverable: false,
        incomingTransferRequest: null,
        lastWsEvent: "receiver_disabled",
      })
      syncDesktopReceiverPresence(get())
      return
    }

    if (state.mode === "receiver" || state.discoverable) {
      get().exitReceiverMode()
      return
    }

    if (state.mode === "idle" && state.wsConnectionStatus !== "offline") {
      get().disconnectWebSocket()
    }
  },

  registerDevice: async () => {
    const state = get()
    if (!state.onboardingCompleted || !state.username || !state.deviceId) {
      console.log("[REGISTER] registerDevice() skipped — identity not ready")
      return
    }
    if (state.wsConnectionStatus !== "connected") {
      console.log("[REGISTER] registerDevice() skipped — ws offline", {
        mode: state.mode,
      })
      return
    }

    const registrationMode = toRegistrationMode(state.mode)
    if (!registrationMode) {
      console.log("[REGISTER] registerDevice() skipped — mode idle")
      set({ registeredMode: "none" })
      return
    }

    console.log("[REGISTER] registerDevice()", {
      mode: state.mode,
      registrationMode,
      socketId: state.wsSocketId.slice(0, 8),
    })

    const sent = await websocketService.sendRegisterMessage({
      username: state.username,
      deviceId: state.deviceId,
      mode: registrationMode,
      deviceType: detectLocalDeviceMetadata().deviceType,
      platform: detectLocalDeviceMetadata().platform,
    })

    if (sent) {
      set({ registeredMode: registrationMode })
    }
  },

  setSelectedFiles: (selectedFiles) => {
    set({
      selectedFiles,
      totalTransferSize: computeTotalTransferSize(selectedFiles),
    })
  },

  addFiles: (incoming) => {
    if (incoming.length === 0) return

    const state = get()
    const existingFiles = state.selectedFiles.map((entry) => entry.file)
    const validation = validateFilesToAdd(existingFiles, incoming)

    const existingKeys = new Set(
      existingFiles.map((f) => `${f.name}\0${f.size}\0${f.lastModified}`)
    )

    const newEntries: SelectedFile[] = validation.acceptedFiles
      .filter((file) => !existingKeys.has(`${file.name}\0${file.size}\0${file.lastModified}`))
      .map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        selected: true,
      }))

    const selectedFiles = [...state.selectedFiles, ...newEntries]

    let notice: string | null = null
    if (validation.errors.length > 0) {
      notice = validation.errors[0]
    } else if (validation.rejected.length > 0) {
      notice = validation.rejected[0].reason
    }

    set({
      selectedFiles,
      totalTransferSize: computeTotalTransferSize(selectedFiles),
      transferNoticeMessage: notice,
    })
  },

  toggleFile: (id) => {
    const selectedFiles = get().selectedFiles.map((f) =>
      f.id === id ? { ...f, selected: !f.selected } : f
    )
    set({
      selectedFiles,
      totalTransferSize: computeTotalTransferSize(selectedFiles),
    })
  },

  clearSelectedFiles: () => set({ selectedFiles: [], totalTransferSize: 0 }),

  syncFileTotals: () =>
    set({
      totalTransferSize: computeTotalTransferSize(get().selectedFiles),
    }),

  setTransferState: (transferState) => set({ transferState }),

  setTransferProgress: (transferProgress) => set({ transferProgress }),

  setTransferMetrics: (metrics) =>
    set({
      ...(metrics.progress !== undefined && {
        transferProgress: metrics.progress,
      }),
      ...(metrics.speed !== undefined && { transferSpeed: metrics.speed }),
      ...(metrics.estimatedTimeRemaining !== undefined && {
        estimatedTimeRemaining: metrics.estimatedTimeRemaining,
      }),
    }),

  resetDiscovery: () => {
    setDesktopLanDiscoveryActive(false)
    const pending = get().pendingOutgoingRequest
    if (pending && get().wsConnectionStatus === "connected") {
      websocketService.sendTransferCancel({
        targetSocketId: pending.targetSocketId,
      })
    }
    resetEntireTransferLifecycle("reset", { abortOutgoing: true })
    clearDiscoveryLayoutRegistry()
    set({
      nearbyDevices: [],
      selectedReceiver: null,
      transferState: "idle",
      connectionStatus: "offline",
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...PARTIAL_TRANSFER_CLEAR,
      ...SESSION_CLEAR_FIELDS,
    })
  },

  resetTransferProgress: () => {
    clearRejectionTimer()
    set({
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...SESSION_CLEAR_FIELDS,
    })
  },

  exitTransferToDiscovery: () => {
    if (get().activeTransferId) {
      get().abortActiveTransferSession()
      return
    }

    resetEntireTransferLifecycle("exit", { abortOutgoing: true })
    setDesktopLanDiscoveryActive(isElectron())
    set({
      selectedReceiver: null,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      transferNoticeMessage: null,
      ...PARTIAL_TRANSFER_CLEAR,
      ...SESSION_CLEAR_FIELDS,
      transferState: "discovering",
      connectionStatus: "searching",
    })
    get().discoverReceivers()
  },

  exitReceiverMode: () => {
    setDesktopLanDiscoveryActive(false)
    const incoming = get().incomingTransferRequest
    if (incoming && get().wsConnectionStatus === "connected") {
      websocketService.sendTransferReject({
        requesterSocketId: incoming.requesterSocketId,
      })
    }
    resetEntireTransferLifecycle("exit", { abortOutgoing: true })
    set({
      mode: "idle",
      discoverable: false,
      connectionStatus: "offline",
      transferState: "idle",
      nearbyDevices: [],
      selectedReceiver: null,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...PARTIAL_TRANSFER_CLEAR,
      ...SESSION_CLEAR_FIELDS,
    })
    syncDesktopReceiverPresence(get())
    get().disconnectWebSocket()
  },

  resetTransferSession: () => {
    resetEntireTransferLifecycle("reset", { abortOutgoing: true })
    set({
      ...initialTransferSession,
      ...PARTIAL_TRANSFER_CLEAR,
    })
    get().registerDevice()
  },
}))

function toRegistrationMode(mode: AppMode): RegistrationMode | null {
  if (mode === "receiver") return "receiver"
  if (mode === "sender") return "sender"
  return null
}

// Identity selectors
export const selectUsername = (state: TransferStoreState) => state.username
export const selectDeviceId = (state: TransferStoreState) => state.deviceId
export const selectOnboardingCompleted = (state: TransferStoreState) =>
  state.onboardingCompleted
export const selectIsHydrated = (state: TransferStoreState) => state.isHydrated
export const selectNeedsOnboarding = (state: TransferStoreState) =>
  state.isHydrated && !state.onboardingCompleted
export const selectInitialize = (state: TransferStoreState) => state.initialize
export const selectCompleteOnboarding = (state: TransferStoreState) =>
  state.completeOnboarding
export const selectRenameUsername = (state: TransferStoreState) =>
  state.renameUsername
export const selectShowProfile = (state: TransferStoreState) =>
  state.isHydrated && state.onboardingCompleted && Boolean(state.username)

// Transfer selectors
export const selectMode = (state: TransferStoreState) => state.mode
export const selectDiscoverable = (state: TransferStoreState) =>
  state.discoverable
export const selectNearbyDevices = (state: TransferStoreState) =>
  state.nearbyDevices
export const selectNearbyDeviceCount = (state: TransferStoreState) =>
  state.nearbyDevices.length
export const selectSelectedReceiver = (state: TransferStoreState) =>
  state.selectedReceiver
export const selectSelectedReceiverId = (state: TransferStoreState) =>
  state.selectedReceiver?.id ?? ""
export const selectSelectedReceiverUsername = (state: TransferStoreState) =>
  state.selectedReceiver?.username ?? ""
export const selectSelectedFiles = (state: TransferStoreState) =>
  state.selectedFiles
export const selectAllFiles = selectSelectedFiles
/** Primitive selector — safe for subscriptions (never returns new references). */
export const selectHasFileSelection = (state: TransferStoreState) =>
  state.selectedFiles.some((f) => f.selected)
export const selectActiveFileCount = (state: TransferStoreState) =>
  state.selectedFiles.reduce((n, f) => (f.selected ? n + 1 : n), 0)
export const selectTotalTransferSize = (state: TransferStoreState) =>
  state.totalTransferSize
export const selectTransferState = (state: TransferStoreState) =>
  state.transferState
export const selectTransferProgress = (state: TransferStoreState) =>
  state.transferProgress
export const selectTransferSpeed = (state: TransferStoreState) =>
  state.transferSpeed
export const selectEstimatedTimeRemaining = (state: TransferStoreState) =>
  state.estimatedTimeRemaining
export const selectConnectionStatus = (state: TransferStoreState) =>
  state.connectionStatus
export const selectWsConnectionStatus = (state: TransferStoreState) =>
  state.wsConnectionStatus
export const selectWsSocketId = (state: TransferStoreState) => state.wsSocketId
export const selectRegisteredMode = (state: TransferStoreState) =>
  state.registeredMode
export const selectLastWsEvent = (state: TransferStoreState) => state.lastWsEvent
export const selectIncomingTransferRequest = (state: TransferStoreState) =>
  state.incomingTransferRequest
export const selectHasIncomingTransferRequest = (state: TransferStoreState) =>
  state.incomingTransferRequest !== null
export const selectPendingOutgoingRequest = (state: TransferStoreState) =>
  state.pendingOutgoingRequest
export const selectTransferRejectionMessage = (state: TransferStoreState) =>
  state.transferRejectionMessage
export const selectTransferNoticeMessage = (state: TransferStoreState) =>
  state.transferNoticeMessage
export const selectIsFinalizingTransfer = (state: TransferStoreState) =>
  state.isFinalizingTransfer
export const selectIsReconstructingFiles = (state: TransferStoreState) =>
  state.isReconstructingFiles
export const selectShowFinalizingOverlay = (state: TransferStoreState) =>
  state.mode === "receiver" &&
  state.isFinalizingTransfer &&
  state.completionSummary === null
export const selectActiveTransferPeer = (state: TransferStoreState) =>
  state.activeTransferPeer
export const selectActiveTransferPeerUsername = (state: TransferStoreState) =>
  state.activeTransferPeer?.username ?? ""
export const selectIncomingFileCount = (state: TransferStoreState) =>
  state.incomingFilesMetadata.length
export const selectIncomingFilesTotalSize = (state: TransferStoreState) =>
  state.incomingFilesMetadata.reduce((sum, f) => sum + f.size, 0)
export const selectActiveTransferId = (state: TransferStoreState) =>
  state.activeTransferId
export const selectTransferSessionStatus = (state: TransferStoreState) =>
  state.transferSessionStatus ?? ""
export const selectCanRequestTransfer = (state: TransferStoreState) =>
  canStartOutgoingRequest(state)
export const selectHasActiveTransferSession = (state: TransferStoreState) =>
  state.activeTransferId !== ""
export const selectTransferStartedAt = (state: TransferStoreState) =>
  state.transferStartedAt ?? 0

// Actions
export const selectSetMode = (state: TransferStoreState) => state.setMode
export const selectStartSendFlow = (state: TransferStoreState) =>
  state.startSendFlow
export const selectStartReceiveFlow = (state: TransferStoreState) =>
  state.startReceiveFlow
export const selectStartDiscovery = (state: TransferStoreState) =>
  state.startDiscovery
export const selectRequestTransferToReceiver = (state: TransferStoreState) =>
  state.requestTransferToReceiver
export const selectCancelOutgoingTransferRequest = (state: TransferStoreState) =>
  state.cancelOutgoingTransferRequest
export const selectAcceptIncomingTransferRequest = (state: TransferStoreState) =>
  state.acceptIncomingTransferRequest
export const selectRejectIncomingTransferRequest = (state: TransferStoreState) =>
  state.rejectIncomingTransferRequest
export const selectAddFiles = (state: TransferStoreState) => state.addFiles
export const selectToggleFile = (state: TransferStoreState) => state.toggleFile
export const selectResetTransferSession = (state: TransferStoreState) =>
  state.resetTransferSession
export const selectResetDiscovery = (state: TransferStoreState) =>
  state.resetDiscovery
export const selectRefreshTrustedNearbyDevices = (state: TransferStoreState) =>
  state.refreshTrustedNearbyDevices
export const selectResetTransferProgress = (state: TransferStoreState) =>
  state.resetTransferProgress
export const selectExitTransferToDiscovery = (state: TransferStoreState) =>
  state.exitTransferToDiscovery
export const selectExitReceiverMode = (state: TransferStoreState) =>
  state.exitReceiverMode
export const selectBytesTransferred = (state: TransferStoreState) =>
  state.bytesTransferred
export const selectActiveTransferTotalBytes = (state: TransferStoreState) =>
  state.activeTransferTotalBytes
export const selectStartOutgoingFileTransfer = (state: TransferStoreState) =>
  state.startOutgoingFileTransfer
export const selectReceivedFileCount = (state: TransferStoreState) =>
  state.incomingFilesMetadata.length
export const selectDownloadAllReceivedFiles = (state: TransferStoreState) =>
  state.downloadAllReceivedFiles
export const selectDownloadSelectedReceivedFiles = (state: TransferStoreState) =>
  state.downloadSelectedReceivedFiles
export const selectToggleCompletedFileSelection = (state: TransferStoreState) =>
  state.toggleCompletedFileSelection
export const selectSelectedCompletedFileIds = (state: TransferStoreState) =>
  state.selectedCompletedFileIds
export const selectReceivedFilesSavedToDownloads = (state: TransferStoreState) =>
  state.receivedFilesSavedToDownloads
export const selectReceivedFilesSaveDirectory = (state: TransferStoreState) =>
  state.receivedFilesSaveDirectory
export const selectReceivedFilesSaveError = (state: TransferStoreState) =>
  state.receivedFilesSaveError
export const selectPerFileProgressOrder = (state: TransferStoreState) =>
  state.perFileProgressOrder
export const selectPerFileTransferProgress = (state: TransferStoreState) =>
  state.perFileTransferProgress
export const selectConnectWebSocket = (state: TransferStoreState) =>
  state.connectWebSocket
export const selectDisconnectWebSocket = (state: TransferStoreState) =>
  state.disconnectWebSocket
export const selectRegisterDevice = (state: TransferStoreState) =>
  state.registerDevice
export const selectDiscoverReceivers = (state: TransferStoreState) =>
  state.discoverReceivers
export const selectClearNearbyDevices = (state: TransferStoreState) =>
  state.clearNearbyDevices
export const selectExitActiveTransferSession = (state: TransferStoreState) =>
  state.exitActiveTransferSession
export const selectCompleteTransferAndExit = (state: TransferStoreState) =>
  state.completeTransferAndExit
export const selectResetTransferFlow = (state: TransferStoreState) =>
  state.resetTransferFlow
export const selectCompletionSummary = (state: TransferStoreState) =>
  state.completionSummary
export const selectHasCompletionSummary = (state: TransferStoreState) =>
  state.completionSummary !== null
export const selectShowTransferComplete = (state: TransferStoreState) =>
  state.completionSummary !== null || state.transferState === "completed"

/** @internal Used by tests or dev tools to reset first-launch state */
export function clearOnboardingForDev(): void {
  if (!import.meta.env.DEV) return
  setOnboardingComplete(false)
}
