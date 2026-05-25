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
  name: string
  size: number
  type: string
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
  | "transferring"
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
