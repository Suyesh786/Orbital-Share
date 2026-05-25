export const STORAGE_KEYS = {
  username: "orbitalshare_username",
  deviceId: "orbitalshare_device_id",
  onboarding: "orbitalshare_onboarding",
} as const

export type AppMode = "idle" | "sender" | "receiver"

export type TransferState =
  | "idle"
  | "discovering"
  | "requesting"
  | "connecting"
  | "waiting"
  | "transferring"
  | "completed"
  | "failed"

export type ConnectionStatus =
  | "offline"
  | "searching"
  | "requesting"
  | "connected"

/** Realtime WebSocket link to Orbital Share server (Phase 2+) */
export type WebSocketConnectionStatus =
  | "offline"
  | "connecting"
  | "connected"

export type { RegistrationMode } from "@/types/websocket"

export type DeviceStatus = "available" | "busy" | "offline"
export type DeviceType = "mac" | "android"

export interface NearbyDevice {
  id: string
  /** Target WebSocket connection for transfer_request */
  socketId: string
  username: string
  status: DeviceStatus
  deviceType: DeviceType
  signalStrength: number
  /** Orbital radar layout (degrees) */
  angle: number
  /** Orbital radar ring index */
  orbit: number
}

export interface TransferFileMetadata {
  fileId?: string
  name: string
  size: number
  type: string
}

/** In-memory chunk assembly (receiver) */
export interface IncomingFileChunkState {
  metadata: TransferFileMetadata & { fileId: string }
  chunks: Array<Uint8Array | null>
  receivedBytes: number
  totalChunks: number
  completed: boolean
}

/** Reconstructed in-memory file (receiver — downloadable via Phase 3.2) */
export interface ReceivedFileMemory {
  fileId: string
  name: string
  size: number
  type: string
  receivedBytes: number
  completed: boolean
  blob: Blob
}

export interface IncomingTransferRequest {
  requestId: string
  requesterSocketId: string
  senderUsername: string
  senderDeviceId: string
  files: TransferFileMetadata[]
  fileCount: number
  totalSize: number
  timestamp: number
}

export interface TransferPeer {
  socketId: string
  username: string
  deviceId: string
}

export interface PendingOutgoingRequest {
  requestId: string
  targetSocketId: string
}

/** Server-authoritative transfer session status (Phase 2.5+) */
export type TransferSessionStatus =
  | "requesting"
  | "connecting"
  | "metadata"
  | "transferring"
  | "reconstructing"
  | "completed"
  | "cancelled"
  | "failed"

export interface SelectedFile {
  id: string
  file: File
  selected: boolean
}

export interface DeviceIdentity {
  deviceId: string
  username: string
  onboardingCompleted: boolean
}

export interface PersistedDeviceState {
  username: string | null
  deviceId: string | null
  onboardingCompleted: boolean
}

/** Immutable snapshot for completion UI — independent of live session state */
export interface CompletionSummary {
  mode: "sender" | "receiver"
  fileCount: number
  totalBytes: number
  fileNames: string[]
  peerUsername?: string
}
