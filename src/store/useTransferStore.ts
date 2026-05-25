import { create } from "zustand"
import { computeTotalTransferSize } from "@/store/transferUtils"
import { websocketService } from "@/services/websocket"
import { mapReceiversToNearbyDevices } from "@/utils/discovery"
import type { ReceiverDiscoveryEntry } from "@/types/websocket"
import type {
  AppMode,
  ConnectionStatus,
  IncomingTransferRequest,
  NearbyDevice,
  PendingOutgoingRequest,
  RegistrationMode,
  SelectedFile,
  TransferFileMetadata,
  TransferPeer,
  TransferSessionStatus,
  TransferState,
  WebSocketConnectionStatus,
} from "@/types/device"
import type {
  TransferRequestAcceptedPayload,
  TransferRequestRejectedPayload,
  TransferSessionClosedPayload,
  TransferSessionCompletedPayload,
  TransferSessionFailedPayload,
} from "@/types/websocket"
import { getActiveSelectedFiles } from "@/store/transferUtils"
import {
  getOrCreateDeviceId,
  loadPersistedDeviceState,
  setOnboardingComplete,
  setStoredUsername,
  validateUsername,
} from "@/utils/device"

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

  // Transfer requests (Phase 2.4)
  incomingTransferRequest: IncomingTransferRequest | null
  pendingOutgoingRequest: PendingOutgoingRequest | null
  transferRejectionMessage: string | null
  activeTransferPeer: TransferPeer | null
  incomingFilesMetadata: TransferFileMetadata[]

  // Transfer session (Phase 2.5 — server-authoritative)
  activeTransferId: string
  transferSessionStatus: TransferSessionStatus | null
  transferStartedAt: number | null

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
  requestTransferToReceiver: (device: NearbyDevice) => void
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
  finalizeLocalTransferSession: () => void
  completeTransferAndExit: () => void
  exitActiveTransferSession: () => void
  beginMockTransfer: () => void
  tickMockTransfer: () => void
  completeMockTransfer: () => void
  resetDiscovery: () => void
  resetTransferProgress: () => void
  exitTransferToDiscovery: () => void
  exitReceiverMode: () => void
  resetTransferSession: () => void
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
  incomingTransferRequest: null as IncomingTransferRequest | null,
  pendingOutgoingRequest: null as PendingOutgoingRequest | null,
  transferRejectionMessage: null as string | null,
  activeTransferPeer: null as TransferPeer | null,
  incomingFilesMetadata: [] as TransferFileMetadata[],
  activeTransferId: "",
  transferSessionStatus: null as TransferSessionStatus | null,
  transferStartedAt: null as number | null,
  connectionStatus: "offline" as ConnectionStatus,
}

let wsStatusUnsubscribe: (() => void) | null = null
let rejectionClearTimer: ReturnType<typeof setTimeout> | null = null
let transferCompleteSentForId = ""

function buildOutgoingFileMetadata(files: SelectedFile[]): TransferFileMetadata[] {
  return getActiveSelectedFiles(files).map((entry) => ({
    name: entry.file.name,
    size: entry.file.size,
    type: entry.file.type || "application/octet-stream",
  }))
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
  transferSessionStatus: null as TransferSessionStatus | null,
  transferStartedAt: null as number | null,
  activeTransferPeer: null as TransferPeer | null,
  incomingFilesMetadata: [] as TransferFileMetadata[],
} as const

function toRegistrationMode(mode: AppMode): RegistrationMode {
  return mode === "receiver" ? "receiver" : "sender"
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

    get().registerDevice()
    return true
  },

  renameUsername: (rawUsername) => {
    const username = validateUsername(rawUsername)
    if (!username) return false

    setStoredUsername(username)
    set({ username })
    get().registerDevice()
    return true
  },

  setMode: (mode) => set({ mode }),

  startSendFlow: () => {
    clearRejectionTimer()
    set({
      mode: "sender",
      transferState: "idle",
      connectionStatus: "offline",
      discoverable: false,
      selectedReceiver: null,
      nearbyDevices: [],
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...SESSION_CLEAR_FIELDS,
    })
    get().registerDevice()
  },

  startReceiveFlow: () => {
    set({
      mode: "receiver",
      discoverable: true,
      connectionStatus: "searching",
      transferState: "waiting",
      nearbyDevices: [],
      selectedReceiver: null,
    })
    get().registerDevice()
  },

  startDiscovery: () => {
    clearRejectionTimer()
    set({
      transferState: "discovering",
      connectionStatus: "searching",
      nearbyDevices: [],
      selectedReceiver: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...SESSION_CLEAR_FIELDS,
    })
    get().discoverReceivers()
  },

  discoverReceivers: () => {
    const state = get()
    if (state.mode !== "sender") return
    if (state.wsConnectionStatus !== "connected") return

    if (import.meta.env.DEV) {
      console.log("[WS] discoverReceivers()")
    }

    const sent = websocketService.sendDiscoverReceivers()
    if (sent) {
      set({ lastWsEvent: "discover_receivers" })
    }
  },

  clearNearbyDevices: () => set({ nearbyDevices: [] }),

  applyReceiversList: (receivers) => {
    const selfSocketId = get().wsSocketId
    const filtered = selfSocketId
      ? receivers.filter((r) => r.socketId !== selfSocketId)
      : receivers
    const nearbyDevices = mapReceiversToNearbyDevices(filtered)

    if (import.meta.env.DEV) {
      console.log(`[WS] receivers_list applied: ${nearbyDevices.length}`)
    }

    const currentId = get().selectedReceiver?.id
    const stillSelected =
      currentId && nearbyDevices.some((d) => d.id === currentId)
    const state = get()
    const keepRequesting =
      state.transferState === "requesting" && stillSelected

    set({
      nearbyDevices,
      lastWsEvent: "receivers_list",
      selectedReceiver: stillSelected ? state.selectedReceiver : null,
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
  },

  requestTransferToReceiver: (device) => {
    const state = get()
    if (state.mode !== "sender" || state.transferState !== "discovering") {
      return
    }
    if (state.wsConnectionStatus !== "connected" || !device.socketId) {
      return
    }

    const files = buildOutgoingFileMetadata(state.selectedFiles)
    if (files.length === 0) return

    const requestId = crypto.randomUUID()

    set({
      selectedReceiver: device,
      transferState: "requesting",
      connectionStatus: "requesting",
      pendingOutgoingRequest: {
        requestId,
        targetSocketId: device.socketId,
      },
      transferRejectionMessage: null,
      lastWsEvent: "transfer_request",
    })

    websocketService.sendTransferRequest({
      targetSocketId: device.socketId,
      senderUsername: state.username,
      senderDeviceId: state.deviceId,
      files,
    })
  },

  cancelOutgoingTransferRequest: () => {
    const state = get()
    const pending = state.pendingOutgoingRequest

    if (pending && state.wsConnectionStatus === "connected") {
      websocketService.sendTransferCancel({
        targetSocketId: pending.targetSocketId,
      })
    }

    set({
      pendingOutgoingRequest: null,
      selectedReceiver: null,
      transferState: "discovering",
      connectionStatus: "searching",
      lastWsEvent: "transfer_cancel",
    })
  },

  acceptIncomingTransferRequest: () => {
    const state = get()
    const incoming = state.incomingTransferRequest
    if (!incoming || state.mode !== "receiver") return

    websocketService.sendTransferAccept({
      requesterSocketId: incoming.requesterSocketId,
    })
  },

  rejectIncomingTransferRequest: () => {
    const state = get()
    const incoming = state.incomingTransferRequest
    if (!incoming || state.mode !== "receiver") return

    websocketService.sendTransferReject({
      requesterSocketId: incoming.requesterSocketId,
    })

    set({
      incomingTransferRequest: null,
      lastWsEvent: "transfer_reject",
    })
  },

  clearTransferRequestState: () => {
    clearRejectionTimer()
    set({
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...SESSION_CLEAR_FIELDS,
    })
  },

  applyTransferAccepted: (payload: TransferRequestAcceptedPayload) => {
    const state = get()
    const wsSocketId = state.wsSocketId
    const isSender = wsSocketId === payload.senderSocketId
    const isReceiver = wsSocketId === payload.receiverSocketId

    if (!isSender && !isReceiver) return

    if (isSender) {
      if (!state.pendingOutgoingRequest) return
    } else {
      const incoming = state.incomingTransferRequest
      if (
        !incoming ||
        incoming.requesterSocketId !== payload.senderSocketId
      ) {
        return
      }
    }

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
      pendingOutgoingRequest: null,
      incomingTransferRequest: null,
      transferState: "connecting",
      connectionStatus: "connected",
      activeTransferId: payload.transferId,
      transferSessionStatus: "connecting",
      transferStartedAt: Date.now(),
      activeTransferPeer: peer,
      incomingFilesMetadata: isReceiver ? payload.files : state.incomingFilesMetadata,
      transferRejectionMessage: null,
      lastWsEvent: "transfer_request_accepted",
    })
  },

  applyTransferSessionClosed: (payload: TransferSessionClosedPayload) => {
    const state = get()
    if (!state.activeTransferId || state.activeTransferId !== payload.transferId) {
      return
    }
    transferCompleteSentForId = ""
    get().exitActiveTransferSession()
    set({ lastWsEvent: "transfer_session_closed" })
  },

  applyTransferSessionFailed: (payload: TransferSessionFailedPayload) => {
    const state = get()
    if (!state.activeTransferId || state.activeTransferId !== payload.transferId) {
      return
    }
    transferCompleteSentForId = ""
    get().exitActiveTransferSession()
    set({
      transferState: "failed",
      transferSessionStatus: "failed",
      lastWsEvent: "transfer_session_failed",
    })
  },

  notifyTransferComplete: () => {
    const { activeTransferId, wsConnectionStatus, transferSessionStatus } = get()
    if (!activeTransferId || wsConnectionStatus !== "connected") return
    if (transferSessionStatus !== "transferring" && transferSessionStatus !== "completed") {
      return
    }
    if (transferCompleteSentForId === activeTransferId) return

    const sent = websocketService.sendTransferComplete({
      transferId: activeTransferId,
    })

    if (sent) {
      transferCompleteSentForId = activeTransferId
      set({ lastWsEvent: "transfer_complete" })
    }
  },

  finalizeLocalTransferSession: () => {
    const state = get()
    const isSender = state.mode === "sender"

    transferCompleteSentForId = ""

    set({
      ...SESSION_CLEAR_FIELDS,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      transferProgress: 100,
      transferState: "completed",
      connectionStatus: "searching",
      selectedReceiver: isSender ? null : state.selectedReceiver,
      discoverable: isSender ? state.discoverable : true,
    })
  },

  applyTransferSessionCompleted: (payload: TransferSessionCompletedPayload) => {
    const state = get()
    if (
      state.activeTransferId &&
      state.activeTransferId !== payload.transferId
    ) {
      return
    }

    get().finalizeLocalTransferSession()
    set({ lastWsEvent: "transfer_session_completed" })
  },

  completeTransferAndExit: () => {
    const isSender = get().mode === "sender"
    transferCompleteSentForId = ""

    set({
      ...SESSION_CLEAR_FIELDS,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      transferState: isSender ? "discovering" : "waiting",
      connectionStatus: "searching",
      selectedReceiver: isSender ? null : get().selectedReceiver,
      discoverable: isSender ? get().discoverable : true,
    })

    if (isSender) {
      get().discoverReceivers()
    }
  },

  exitActiveTransferSession: () => {
    const state = get()
    const isSender = state.mode === "sender"

    transferCompleteSentForId = ""
    clearRejectionTimer()
    set({
      ...SESSION_CLEAR_FIELDS,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      transferState: isSender ? "discovering" : "waiting",
      connectionStatus: "searching",
      selectedReceiver: isSender ? null : state.selectedReceiver,
      discoverable: isSender ? state.discoverable : true,
    })

    if (isSender) {
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

    const message = payload.reason ?? "Receiver declined your request"

    set({
      pendingOutgoingRequest: null,
      selectedReceiver: null,
      transferState: "discovering",
      connectionStatus: "searching",
      transferRejectionMessage: message,
      lastWsEvent: "transfer_request_rejected",
    })

    scheduleRejectionClear(set)
  },

  setNearbyDevices: (devices) => set({ nearbyDevices: devices }),

  setDiscoverable: (discoverable) => set({ discoverable }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  setWsConnectionStatus: (wsConnectionStatus) => set({ wsConnectionStatus }),

  connectWebSocket: () => {
    if (wsStatusUnsubscribe) return

    wsStatusUnsubscribe = websocketService.subscribeStatus((status) => {
      set({ wsConnectionStatus: status })
    })

    websocketService.connect({
      onOpen: () => {
        set({ wsConnectionStatus: "connected" })
        get().registerDevice()
      },
      onClose: () => {
        clearRejectionTimer()
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
      },
      onError: () => {
        const status = websocketService.getStatus()
        if (status !== "connected") {
          set({ wsConnectionStatus: status === "connecting" ? "connecting" : "offline" })
        }
      },
      onConnected: (socketId) => {
        set({ wsSocketId: socketId })
        get().registerDevice()
      },
      onRegistered: (mode) => {
        set({ registeredMode: mode, lastWsEvent: "registered" })
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
        if (state.mode !== "receiver" || state.transferState !== "waiting") {
          return
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
        set({
          incomingTransferRequest: null,
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
    })

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

  registerDevice: () => {
    const state = get()
    if (!state.onboardingCompleted || !state.username || !state.deviceId) {
      return
    }
    if (state.wsConnectionStatus !== "connected") {
      return
    }

    const registrationMode = toRegistrationMode(state.mode)
    const sent = websocketService.sendRegisterMessage({
      username: state.username,
      deviceId: state.deviceId,
      mode: registrationMode,
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
    const newEntries: SelectedFile[] = incoming.map((file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      selected: true,
    }))
    const selectedFiles = [...get().selectedFiles, ...newEntries]
    set({
      selectedFiles,
      totalTransferSize: computeTotalTransferSize(selectedFiles),
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

  beginMockTransfer: () => {
    if (!get().activeTransferId) return

    set({
      transferState: "transferring",
      transferSessionStatus: "transferring",
      transferProgress: 0,
      transferSpeed: 12_500_000,
      estimatedTimeRemaining: 0,
    })
  },

  tickMockTransfer: () => {
    const { transferProgress, transferSpeed, totalTransferSize } = get()
    if (transferProgress >= 100) return

    const step =
      transferProgress < 70 ? 2.5 : transferProgress < 90 ? 1.2 : 0.4
    const next = Math.min(100, transferProgress + step)
    const transferred = Math.floor((next / 100) * totalTransferSize)
    const estimatedTimeRemaining =
      next > 0 && next < 100
        ? ((100 - next) / next) * (transferred / transferSpeed)
        : 0

    set({
      transferProgress: next,
      transferSpeed,
      estimatedTimeRemaining,
      transferState: next >= 100 ? "completed" : "transferring",
      transferSessionStatus: next >= 100 ? "completed" : "transferring",
    })

    if (next >= 100) {
      get().notifyTransferComplete()
    }
  },

  completeMockTransfer: () => {
    set({
      transferState: "completed",
      transferSessionStatus: "completed",
      transferProgress: 100,
      estimatedTimeRemaining: 0,
    })
    get().notifyTransferComplete()
  },

  resetDiscovery: () => {
    const pending = get().pendingOutgoingRequest
    if (pending && get().wsConnectionStatus === "connected") {
      websocketService.sendTransferCancel({
        targetSocketId: pending.targetSocketId,
      })
    }
    clearRejectionTimer()
    set({
      nearbyDevices: [],
      selectedReceiver: null,
      transferState: "idle",
      connectionStatus: "offline",
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
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
    clearRejectionTimer()
    set({
      selectedReceiver: null,
      transferProgress: 0,
      transferSpeed: 0,
      estimatedTimeRemaining: 0,
      incomingTransferRequest: null,
      pendingOutgoingRequest: null,
      transferRejectionMessage: null,
      ...SESSION_CLEAR_FIELDS,
      transferState: "discovering",
      connectionStatus: "searching",
    })
    get().discoverReceivers()
  },

  exitReceiverMode: () => {
    const incoming = get().incomingTransferRequest
    if (incoming && get().wsConnectionStatus === "connected") {
      websocketService.sendTransferReject({
        requesterSocketId: incoming.requesterSocketId,
      })
    }
    clearRejectionTimer()
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
      ...SESSION_CLEAR_FIELDS,
    })
    get().registerDevice()
  },

  resetTransferSession: () => {
    set({
      ...initialTransferSession,
    })
    get().registerDevice()
  },
}))

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
export const selectResetTransferProgress = (state: TransferStoreState) =>
  state.resetTransferProgress
export const selectExitTransferToDiscovery = (state: TransferStoreState) =>
  state.exitTransferToDiscovery
export const selectExitReceiverMode = (state: TransferStoreState) =>
  state.exitReceiverMode
export const selectBeginMockTransfer = (state: TransferStoreState) =>
  state.beginMockTransfer
export const selectTickMockTransfer = (state: TransferStoreState) =>
  state.tickMockTransfer
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
export const selectShowTransferComplete = (state: TransferStoreState) =>
  state.transferState === "completed"

/** @internal Used by tests or dev tools to reset first-launch state */
export function clearOnboardingForDev(): void {
  if (!import.meta.env.DEV) return
  setOnboardingComplete(false)
}
