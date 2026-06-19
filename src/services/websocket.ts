import TauriWebSocket from '@tauri-apps/plugin-websocket'
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
  private socket: TauriWebSocket | null = null
  private connectionStatus: WebSocketConnectionStatus = "offline"
  private handlers: WebSocketHandlers = {}
  private statusListeners = new Set<WebSocketStatusListener>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private lastSocketId = ""
  private connectWaiters = new Set<(connected: boolean) => void>()
  private removeMessageListener: (() => void) | null = null

  getStatus(): WebSocketConnectionStatus {
    return this.connectionStatus
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
    this.connectionStatus = status
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
      await this.socket.disconnect().catch(() => {})
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

  private async openSocket() {
    if (this.socket || this.connectionStatus === "connecting" || this.connectionStatus === "connected") {
      return
    }

    this.notifyStatus("connecting")

    try {
      this.socket = await TauriWebSocket.connect(currentWsUrl)
      
      this.reconnectAttempt = 0
      console.log("[WS] Connected")
      this.notifyStatus("connected")
      this.resolveConnectWaiters(true)
      this.handlers.onOpen?.()

      this.removeMessageListener = this.socket.addListener((msg) => {
        if (msg.type === "Text") {
          this.routeInboundMessage(msg.data)
        } else if (msg.type === "Binary") {
          const buffer = new Uint8Array(msg.data as number[]).buffer
          void this.routeBinaryMessage(buffer)
        } else if (msg.type === "Close") {
          console.log("[WS] Disconnected (Close Message)")
          this.handleDisconnect()
        }
      })
    } catch (error: unknown) {
      const errStr = error instanceof Error ? error.message : String(error)
      const errObj = typeof error === "object" && error !== null ? JSON.stringify(error) : ""
      console.error(
        `[WS] PLUGIN WS ERROR — connect("${currentWsUrl}") failed:\n` +
        `  message: ${errStr}\n` +
        `  raw: ${errObj}\n` +
        `  type: ${typeof error}`
      )
      this.handleDisconnect()
    }
  }

  private handleDisconnect() {
    if (this.removeMessageListener) {
      this.removeMessageListener()
      this.removeMessageListener = null
    }
    this.socket = null
    if (this.connectionStatus !== "offline") {
      this.notifyStatus("offline")
      this.resolveConnectWaiters(false)
      this.handlers.onClose?.()
      this.scheduleReconnect()
    }
  }

  async disconnect() {
    this.intentionalClose = true
    this.clearReconnectTimer()
    this.handlers = {}
    this.lastSocketId = ""

    if (this.socket) {
      try {
        await this.socket.disconnect()
      } catch (e) {
        console.warn("[WS] Error during disconnect", e)
      }
    }
    
    if (this.removeMessageListener) {
      this.removeMessageListener()
      this.removeMessageListener = null
    }
    this.socket = null
    this.notifyStatus("offline")
  }

  async send(payload: string | ArrayBuffer | Blob): Promise<boolean> {
    if (!this.socket || this.connectionStatus !== "connected") {
      console.warn("[WS] Cannot send — socket not open")
      return false
    }

    try {
      if (typeof payload === "string") {
        await this.socket.send(payload)
      } else if (payload instanceof Blob) {
        const buffer = await payload.arrayBuffer()
        await this.socket.send(Array.from(new Uint8Array(buffer)))
      } else if (payload instanceof ArrayBuffer) {
        await this.socket.send(Array.from(new Uint8Array(payload)))
      }
      return true
    } catch (error) {
      console.error("[WS] Send error:", error)
      return false
    }
  }

  async sendRegisterMessage(payload: RegisterPayload) {
    return this.send(
      JSON.stringify({
        type: "register",
        payload,
      })
    )
  }

  async sendDiscoverReceivers() {
    return this.send(JSON.stringify({ type: "discover_receivers" }))
  }

  async sendTransferRequest(payload: TransferRequestOutboundPayload) {
    return this.send(JSON.stringify({ type: "transfer_request", payload }))
  }

  async sendTransferAccept(payload: TransferAcceptPayload) {
    return this.send(JSON.stringify({ type: "transfer_accept", payload }))
  }

  async sendTransferReject(payload: TransferRejectPayload) {
    return this.send(JSON.stringify({ type: "transfer_reject", payload }))
  }

  async sendTransferCancel(payload: TransferCancelPayload) {
    return this.send(JSON.stringify({ type: "transfer_cancel", payload }))
  }

  async sendTransferAbort(payload: TransferAbortPayload) {
    return this.send(JSON.stringify({ type: "transfer_abort", payload }))
  }

  async sendTransferMetadata(payload: TransferMetadataPayload) {
    return this.send(JSON.stringify({ type: "transfer_metadata", payload }))
  }

  async sendTransferComplete(payload: TransferCompleteOutboundPayload) {
    return this.send(JSON.stringify({ type: "transfer_complete", payload }))
  }

  async sendBinary(payload: ArrayBuffer) {
    return this.send(payload)
  }

  setHandlers(handlers: WebSocketHandlers) {
    this.handlers = { ...this.handlers, ...handlers }
  }
}

export const websocketService = new WebSocketService()
