export type RegistrationMode = "sender" | "receiver"

export interface RegisterPayload {
  username: string
  deviceId: string
  mode: RegistrationMode
}

export interface RegisterMessage {
  type: "register"
  payload: RegisterPayload
}

export interface DiscoverReceiversMessage {
  type: "discover_receivers"
}

export interface ReceiverDiscoveryEntry {
  deviceId: string
  username: string
  socketId: string
  mode: "receiver"
}

export interface ReceiversListMessage {
  type: "receivers_list"
  payload: ReceiverDiscoveryEntry[]
}

export interface ReceiversUpdatedMessage {
  type: "receivers_updated"
}

export interface ConnectedMessage {
  type: "connected"
  socketId: string
  timestamp: number
}

export interface RegisteredMessage {
  type: "registered"
  payload: {
    socketId: string
    deviceId: string
    username: string
    mode: RegistrationMode
  }
}

export interface TransferFilePayload {
  name: string
  size: number
  type: string
}

export interface TransferRequestOutboundPayload {
  targetSocketId: string
  senderUsername: string
  senderDeviceId: string
  files: TransferFilePayload[]
}

export interface TransferAcceptPayload {
  requesterSocketId: string
}

export interface TransferRejectPayload {
  requesterSocketId: string
}

export interface TransferCancelPayload {
  targetSocketId: string
}

export interface IncomingTransferRequestPayload {
  requestId: string
  requesterSocketId: string
  senderUsername: string
  senderDeviceId: string
  files: TransferFilePayload[]
  fileCount: number
  totalSize: number
  timestamp: number
}

export interface TransferRequestAcceptedPayload {
  transferId: string
  senderSocketId: string
  receiverSocketId: string
  senderUsername: string
  receiverUsername: string
  senderDeviceId: string
  receiverDeviceId: string
  files: TransferFilePayload[]
  totalBytes: number
  status: string
}

export interface TransferSessionClosedPayload {
  transferId: string
  reason: string
  closedBySocketId: string
  status: string
}

export interface TransferSessionFailedPayload {
  transferId: string
  reason: string
  status: string
}

export interface TransferSessionCompletedPayload {
  transferId: string
  status: string
}

export interface TransferCompleteOutboundPayload {
  transferId: string
}

export interface TransferRequestRejectedPayload {
  requesterSocketId: string
  reason?: string
}

export interface TransferRequestCancelledPayload {
  requesterSocketId: string
}

export type OutboundWebSocketMessage =
  | RegisterMessage
  | DiscoverReceiversMessage
  | { type: "transfer_request"; payload: TransferRequestOutboundPayload }
  | { type: "transfer_accept"; payload: TransferAcceptPayload }
  | { type: "transfer_reject"; payload: TransferRejectPayload }
  | { type: "transfer_cancel"; payload: TransferCancelPayload }
  | { type: "transfer_complete"; payload: TransferCompleteOutboundPayload }

export type InboundWebSocketMessage =
  | ConnectedMessage
  | RegisteredMessage
  | ReceiversListMessage
  | ReceiversUpdatedMessage
  | { type: "incoming_transfer_request"; payload: IncomingTransferRequestPayload }
  | { type: "transfer_request_accepted"; payload: TransferRequestAcceptedPayload }
  | { type: "transfer_request_rejected"; payload: TransferRequestRejectedPayload }
  | { type: "transfer_request_cancelled"; payload: TransferRequestCancelledPayload }
  | { type: "transfer_session_closed"; payload: TransferSessionClosedPayload }
  | { type: "transfer_session_failed"; payload: TransferSessionFailedPayload }
  | { type: "transfer_session_completed"; payload: TransferSessionCompletedPayload }

export interface ParsedServerMessage {
  type: string
  payload?: unknown
  socketId?: string
  timestamp?: number
}

export function parseServerMessage(raw: unknown): ParsedServerMessage | null {
  try {
    const text = typeof raw === "string" ? raw : String(raw)
    const data = JSON.parse(text) as ParsedServerMessage
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return null
    }
    return data
  } catch {
    return null
  }
}

export function isReceiverDiscoveryEntry(
  value: unknown
): value is ReceiverDiscoveryEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as ReceiverDiscoveryEntry
  return (
    typeof entry.deviceId === "string" &&
    typeof entry.username === "string" &&
    typeof entry.socketId === "string" &&
    entry.mode === "receiver"
  )
}

export function parseReceiversListPayload(
  payload: unknown
): ReceiverDiscoveryEntry[] {
  if (!Array.isArray(payload)) return []
  return payload.filter(isReceiverDiscoveryEntry)
}

function isTransferFilePayload(value: unknown): value is TransferFilePayload {
  if (!value || typeof value !== "object") return false
  const f = value as TransferFilePayload
  return (
    typeof f.name === "string" &&
    typeof f.size === "number" &&
    typeof f.type === "string"
  )
}

export function parseIncomingTransferRequestPayload(
  payload: unknown
): IncomingTransferRequestPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as IncomingTransferRequestPayload
  if (
    typeof p.requestId !== "string" ||
    typeof p.requesterSocketId !== "string" ||
    typeof p.senderUsername !== "string" ||
    typeof p.senderDeviceId !== "string" ||
    !Array.isArray(p.files)
  ) {
    return null
  }

  const files = p.files.filter(isTransferFilePayload)
  const fileCount =
    typeof p.fileCount === "number" ? p.fileCount : files.length
  const totalSize =
    typeof p.totalSize === "number"
      ? p.totalSize
      : files.reduce((sum, f) => sum + f.size, 0)

  return {
    requestId: p.requestId,
    requesterSocketId: p.requesterSocketId,
    senderUsername: p.senderUsername,
    senderDeviceId: p.senderDeviceId,
    files,
    fileCount,
    totalSize,
    timestamp: typeof p.timestamp === "number" ? p.timestamp : Date.now(),
  }
}

export function parseTransferRequestAcceptedPayload(
  payload: unknown
): TransferRequestAcceptedPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as TransferRequestAcceptedPayload
  if (
    typeof p.transferId !== "string" ||
    typeof p.senderSocketId !== "string" ||
    typeof p.receiverSocketId !== "string" ||
    typeof p.senderUsername !== "string" ||
    typeof p.receiverUsername !== "string" ||
    typeof p.senderDeviceId !== "string" ||
    typeof p.receiverDeviceId !== "string" ||
    !Array.isArray(p.files) ||
    typeof p.totalBytes !== "number"
  ) {
    return null
  }

  const files = p.files.filter(isTransferFilePayload)

  return {
    transferId: p.transferId,
    senderSocketId: p.senderSocketId,
    receiverSocketId: p.receiverSocketId,
    senderUsername: p.senderUsername,
    receiverUsername: p.receiverUsername,
    senderDeviceId: p.senderDeviceId,
    receiverDeviceId: p.receiverDeviceId,
    files,
    totalBytes: p.totalBytes,
    status: typeof p.status === "string" ? p.status : "connecting",
  }
}

export function parseTransferSessionClosedPayload(
  payload: unknown
): TransferSessionClosedPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as TransferSessionClosedPayload
  if (
    typeof p.transferId !== "string" ||
    typeof p.reason !== "string" ||
    typeof p.closedBySocketId !== "string"
  ) {
    return null
  }
  return {
    transferId: p.transferId,
    reason: p.reason,
    closedBySocketId: p.closedBySocketId,
    status: typeof p.status === "string" ? p.status : "cancelled",
  }
}

export function parseTransferSessionFailedPayload(
  payload: unknown
): TransferSessionFailedPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as TransferSessionFailedPayload
  if (typeof p.transferId !== "string" || typeof p.reason !== "string") {
    return null
  }
  return {
    transferId: p.transferId,
    reason: p.reason,
    status: typeof p.status === "string" ? p.status : "failed",
  }
}

export function parseTransferRequestRejectedPayload(
  payload: unknown
): TransferRequestRejectedPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as TransferRequestRejectedPayload
  if (typeof p.requesterSocketId !== "string") return null
  return {
    requesterSocketId: p.requesterSocketId,
    reason: typeof p.reason === "string" ? p.reason : undefined,
  }
}

export function parseTransferRequestCancelledPayload(
  payload: unknown
): TransferRequestCancelledPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as TransferRequestCancelledPayload
  if (typeof p.requesterSocketId !== "string") return null
  return p
}

export function parseTransferSessionCompletedPayload(
  payload: unknown
): TransferSessionCompletedPayload | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as TransferSessionCompletedPayload
  if (typeof p.transferId !== "string") return null
  return {
    transferId: p.transferId,
    status: typeof p.status === "string" ? p.status : "completed",
  }
}
