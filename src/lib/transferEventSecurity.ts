import type { TransferSessionIdentity } from "@/lib/transferSessionIdentity"
import { isValidSessionToken } from "@/lib/transferSessionIdentity"

export interface TransferEventGuardState {
  activeTransferId: string
  activeTransferSessionToken: string
  wsSocketId: string
  mode: string
}

/**
 * Reject events for unknown or superseded sessions.
 */
export function shouldRejectTransferEvent(
  state: TransferEventGuardState,
  transferId: string,
  sessionToken?: string
): boolean {
  if (!state.activeTransferId || state.activeTransferId !== transferId) {
    return true
  }
  if (sessionToken !== undefined) {
    if (
      !isValidSessionToken(sessionToken) ||
      sessionToken !== state.activeTransferSessionToken
    ) {
      return true
    }
  }
  return false
}

/**
 * Validate accepted payload matches local socket role.
 */
export function validateAcceptedSessionIdentity(
  identity: TransferSessionIdentity | null,
  localSocketId: string
): boolean {
  if (!identity) return false
  return (
    localSocketId === identity.senderSocketId ||
    localSocketId === identity.receiverSocketId
  )
}
