import {
  guardInboundJsonSize,
  parseServerNoticeMessage,
} from "@/lib/wsDefensiveGuards"
import {
  parseIncomingTransferRequestPayload,
  parseReceiversListPayload,
  parseServerMessage,
  parseTransferRequestAcceptedPayload,
  parseTransferSessionClosedPayload,
  parseTransferSessionCompletedPayload,
  parseTransferSessionFailedPayload,
  parseTransferMetadataPayload,
  parseTransferRequestCancelledPayload,
  parseTransferRequestRejectedPayload,
  type IncomingTransferRequestPayload,
  type TransferMetadataPayload,
  type InboundWebSocketMessage,
  type ReceiverDiscoveryEntry,
  type RegisterPayload,
  type RegistrationMode,
  type TransferAcceptPayload,
  type TransferAbortPayload,
  type TransferCancelPayload,
  type TransferRejectPayload,
  type TransferRequestAcceptedPayload,
  type TransferRequestOutboundPayload,
  type TransferRequestRejectedPayload,
  type TransferCompleteOutboundPayload,
  type TransferSessionClosedPayload,
  type TransferSessionCompletedPayload,
  type TransferSessionFailedPayload,
} from "@/types/websocket"
import { getLocalWebSocketUrlFallback } from "@/lib/electron"

export type WebSocketConnectionStatus = "offline" | "connecting" | "connected"

export type WebSocketStatusListener = (status: WebSocketConnectionStatus) => void

export interface InboundMessageHandlers {
  onConnected?: (socketId: string) => void
  onRegistered?: (mode: RegistrationMode, deviceId: string) => void
  onServerNotice?: (message: string) => void
  onReceiversList?: (receivers: ReceiverDiscoveryEntry[]) => void
  onReceiversUpdated?: () => void
  onIncomingTransferRequest?: (request: IncomingTransferRequestPayload) => void
  onTransferRequestAccepted?: (payload: TransferRequestAcceptedPayload) => void
  onTransferRequestRejected?: (payload: TransferRequestRejectedPayload) => void
  onTransferRequestCancelled?: (requesterSocketId: string) => void
  onTransferSessionClosed?: (payload: TransferSessionClosedPayload) => void
  onTransferSessionFailed?: (payload: TransferSessionFailedPayload) => void
  onTransferSessionCompleted?: (payload: TransferSessionCompletedPayload) => void
  onTransferMetadata?: (payload: TransferMetadataPayload) => void
  onBinaryMessage?: (data: ArrayBuffer) => void
  onMessage?: (message: InboundWebSocketMessage) => void
}

export interface WebSocketHandlers extends InboundMessageHandlers {
  onOpen?: () => void
  onClose?: () => void
  onError?: (event: Event) => void
}

let currentWsUrl =
  import.meta.env.VITE_WS_URL?.trim() || getLocalWebSocketUrlFallback()

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15000

class WebSocketService {
  private socket: WebSocket | null = null
  private handlers: WebSocketHandlers = {}
  private statusListeners = new Set<WebSocketStatusListener>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private lastSocketId = ""
  private connectWaiters = new Set<(connected: boolean) => void>()

  getStatus(): WebSocketConnectionStatus {
    if (!this.socket) return "offline"
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return "connecting"
      case WebSocket.OPEN:
        return "connected"
      default:
        return "offline"
    }
  }

  getLastSocketId(): string {
    return this.lastSocketId
  }

  getUrl(): string {
    return currentWsUrl
  }

  subscribeStatus(listener: WebSocketStatusListener): () => void {
    this.statusListeners.add(listener)
    listener(this.getStatus())
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private notifyStatus(status: WebSocketConnectionStatus) {
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private resolveConnectWaiters(connected: boolean) {
    for (const resolve of this.connectWaiters) {
      resolve(connected)
    }
    this.connectWaiters.clear()
  }

  private scheduleReconnect() {
    if (this.intentionalClose) return

    this.clearReconnectTimer()
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempt,
      RECONNECT_MAX_MS
    )
    this.reconnectAttempt += 1

    this.reconnectTimer = setTimeout(() => {
      this.openSocket()
    }, delay)
  }

  private routeInboundMessage(raw: MessageEvent["data"]) {
    if (!guardInboundJsonSize(raw)) return

    const message = parseServerMessage(raw)
    if (!message) return

    if (message.type === "server_notice") {
      const notice = parseServerNoticeMessage(message.payload)
      if (notice) {
        this.handlers.onServerNotice?.(notice)
      }
      return
    }

    if (message.type === "connected" && typeof message.socketId === "string") {
      this.lastSocketId = message.socketId
      this.handlers.onConnected?.(message.socketId)
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "registered" && message.payload) {
      const payload = message.payload as {
        socketId: string
        deviceId: string
        mode: RegistrationMode
      }
      this.lastSocketId = payload.socketId
      this.handlers.onRegistered?.(payload.mode, payload.deviceId)
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "receivers_list") {
      const receivers = parseReceiversListPayload(message.payload)
      this.handlers.onReceiversList?.(receivers)
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "receivers_updated") {
      this.handlers.onReceiversUpdated?.()
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "incoming_transfer_request") {
      const request = parseIncomingTransferRequestPayload(message.payload)
      if (request) {
        this.handlers.onIncomingTransferRequest?.(request)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_request_accepted") {
      const accepted = parseTransferRequestAcceptedPayload(message.payload)
      if (accepted) {
        this.handlers.onTransferRequestAccepted?.(accepted)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_request_rejected") {
      const rejected = parseTransferRequestRejectedPayload(message.payload)
      if (rejected) {
        this.handlers.onTransferRequestRejected?.(rejected)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_request_cancelled") {
      const cancelled = parseTransferRequestCancelledPayload(message.payload)
      if (cancelled) {
        this.handlers.onTransferRequestCancelled?.(cancelled.requesterSocketId)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_session_closed") {
      const closed = parseTransferSessionClosedPayload(message.payload)
      if (closed) {
        this.handlers.onTransferSessionClosed?.(closed)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_session_failed") {
      const failed = parseTransferSessionFailedPayload(message.payload)
      if (failed) {
        this.handlers.onTransferSessionFailed?.(failed)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_session_completed") {
      const completed = parseTransferSessionCompletedPayload(message.payload)
      if (completed) {
        this.handlers.onTransferSessionCompleted?.(completed)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    if (message.type === "transfer_metadata") {
      const metadata = parseTransferMetadataPayload(message.payload)
      if (metadata) {
        this.handlers.onTransferMetadata?.(metadata)
      }
      this.handlers.onMessage?.(message as InboundWebSocketMessage)
      return
    }

    this.handlers.onMessage?.(message as InboundWebSocketMessage)
  }

  private async routeBinaryMessage(raw: ArrayBuffer) {
    this.handlers.onBinaryMessage?.(raw)
  }

  connect(handlers: WebSocketHandlers = {}) {
    this.handlers = handlers
    this.intentionalClose = false
    this.reconnectAttempt = 0
    this.openSocket()
  }

  async connectToUrl(url: string, timeoutMs = 5000): Promise<boolean> {
    const nextUrl = url.trim()
    if (!nextUrl) return false

    const previousUrl = currentWsUrl
    if (this.getStatus() === "connected" && previousUrl === nextUrl) {
      return true
    }

    currentWsUrl = nextUrl

    this.intentionalClose = false
    this.clearReconnectTimer()

    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }

    this.openSocket()

    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.connectWaiters.delete(waiter)
        resolve(false)
      }, timeoutMs)

      const waiter = (connected: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(connected)
      }

      this.connectWaiters.add(waiter)
    })
  }

  private openSocket() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    this.notifyStatus("connecting")

    try {
      this.socket = new WebSocket(currentWsUrl)
    } catch (error) {
      console.error("[WS] Failed to create socket:", error)
      this.notifyStatus("offline")
      this.resolveConnectWaiters(false)
      this.scheduleReconnect()
      return
    }

    this.socket.onopen = () => {
      this.reconnectAttempt = 0
      console.log("[WS] Connected")
      this.notifyStatus("connected")
      this.resolveConnectWaiters(true)
      this.handlers.onOpen?.()
    }

    this.socket.onclose = () => {
      console.log("[WS] Disconnected")
      this.socket = null
      this.notifyStatus("offline")
      this.resolveConnectWaiters(false)
      this.handlers.onClose?.()
      this.scheduleReconnect()
    }

    this.socket.onerror = (event) => {
      console.error("[WS] Error", event)
      if (this.getStatus() !== "connected") {
        this.resolveConnectWaiters(false)
      }
      this.handlers.onError?.(event)
    }

    this.socket.onmessage = (event) => {
      const data = event.data
      if (data instanceof ArrayBuffer) {
        void this.routeBinaryMessage(data)
        return
      }
      if (data instanceof Blob) {
        void data.arrayBuffer().then((buffer) => this.routeBinaryMessage(buffer))
        return
      }
      this.routeInboundMessage(data)
    }
  }

  disconnect() {
    this.intentionalClose = true
    this.clearReconnectTimer()
    this.handlers = {}
    this.lastSocketId = ""

    if (this.socket) {
      this.socket.onclose = null
      this.socket.close()
      this.socket = null
    }

    this.notifyStatus("offline")
  }

  send(payload: string | ArrayBuffer | Blob) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Cannot send — socket not open")
      return false
    }

    this.socket.send(payload)
    return true
  }

  sendRegisterMessage(payload: RegisterPayload) {
    return this.send(
      JSON.stringify({
        type: "register",
        payload,
      })
    )
  }

  sendDiscoverReceivers() {
    return this.send(JSON.stringify({ type: "discover_receivers" }))
  }

  sendTransferRequest(payload: TransferRequestOutboundPayload) {
    return this.send(JSON.stringify({ type: "transfer_request", payload }))
  }

  sendTransferAccept(payload: TransferAcceptPayload) {
    return this.send(JSON.stringify({ type: "transfer_accept", payload }))
  }

  sendTransferReject(payload: TransferRejectPayload) {
    return this.send(JSON.stringify({ type: "transfer_reject", payload }))
  }

  sendTransferCancel(payload: TransferCancelPayload) {
    return this.send(JSON.stringify({ type: "transfer_cancel", payload }))
  }

  sendTransferAbort(payload: TransferAbortPayload) {
    return this.send(JSON.stringify({ type: "transfer_abort", payload }))
  }

  sendTransferMetadata(payload: TransferMetadataPayload) {
    return this.send(JSON.stringify({ type: "transfer_metadata", payload }))
  }

  sendTransferComplete(payload: TransferCompleteOutboundPayload) {
    return this.send(JSON.stringify({ type: "transfer_complete", payload }))
  }

  sendBinary(payload: ArrayBuffer) {
    return this.send(payload)
  }

  setHandlers(handlers: WebSocketHandlers) {
    this.handlers = { ...this.handlers, ...handlers }
  }
}

export const websocketService = new WebSocketService()
