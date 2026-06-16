import type { TransferSessionStatus } from "@/types/device"

/**
 * Client transfer session status lifecycle (Phase 4.1).
 * Aligns with: idle → requesting → connecting → metadata → transferring
 * → reconstructing → completed → finalized → idle
 */
const ALLOWED_SESSION_TRANSITIONS: Record<
  TransferSessionStatus,
  ReadonlySet<TransferSessionStatus>
> = {
  requesting: new Set(["connecting", "cancelled", "failed"]),
  connecting: new Set(["metadata", "transferring", "cancelled", "failed"]),
  metadata: new Set(["transferring", "cancelled", "failed"]),
  transferring: new Set(["reconstructing", "completed", "cancelled", "failed"]),
  reconstructing: new Set(["completed", "cancelled", "failed"]),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
}

export function isValidSessionStatusTransition(
  from: TransferSessionStatus | null | undefined,
  to: TransferSessionStatus
): boolean {
  if (!from) return to === "connecting" || to === "requesting"
  const allowed = ALLOWED_SESSION_TRANSITIONS[from]
  return allowed.has(to)
}

export function canApplySessionStatus(
  current: TransferSessionStatus | null | undefined,
  next: TransferSessionStatus
): boolean {
  if (!current) return true
  if (current === next) return true
  return isValidSessionStatusTransition(current, next)
}

export interface TransferEventGuardInput {
  activeTransferId: string
  transferSessionStatus: TransferSessionStatus | null
  expectedTransferId?: string
}

export function shouldIgnoreStaleTransferId(
  state: TransferEventGuardInput,
  transferId: string
): boolean {
  if (!state.activeTransferId) return true
  return state.activeTransferId !== transferId
}

export function canProcessTransferMetadata(
  state: TransferEventGuardInput
): boolean {
  if (!state.activeTransferId) return false
  if (
    state.transferSessionStatus !== "connecting" &&
    state.transferSessionStatus !== "transferring"
  ) {
    return false
  }
  return true
}

export function canProcessFileChunk(state: TransferEventGuardInput): boolean {
  if (!state.activeTransferId) return false
  return (
    state.transferSessionStatus === "transferring" ||
    state.transferSessionStatus === "reconstructing"
  )
}

export function canStartOutgoingRequest(state: {
  mode: string
  transferState: string
  pendingOutgoingRequest: unknown
  activeTransferId: string
  wsConnectionStatus: string
}): boolean {
  return (
    state.mode === "sender" &&
    state.transferState === "discovering" &&
    !state.pendingOutgoingRequest &&
    !state.activeTransferId &&
    state.wsConnectionStatus === "connected"
  )
}

export function canAcceptIncomingRequest(state: {
  mode: string
  incomingTransferRequest: unknown
  activeTransferId: string
  transferState: string
}): boolean {
  return (
    state.mode === "receiver" &&
    Boolean(state.incomingTransferRequest) &&
    !state.activeTransferId &&
    state.transferState === "waiting"
  )
}
