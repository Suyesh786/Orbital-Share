/**
 * Transfer lifecycle reset helpers (Phase 4.4 bugfix).
 * Module-level runtime flags live in useTransferStore; this file documents
 * and logs authoritative cleanup reasons.
 */

export type LifecycleResetReason =
  | "transfer_accepted"
  | "send_flow"
  | "receive_flow"
  | "discovery"
  | "finalize"
  | "exit"
  | "abort"
  | "reset"
  | "ws_close"
  | "reject"
  | "failed"
  | "session_closed"

export interface LifecycleResetOptions {
  /** Stop in-flight sender streams; default false for new sessions. */
  abortOutgoing?: boolean
}

export function logLifecycleReset(
  reason: LifecycleResetReason,
  detail?: string
): void {
  if (!import.meta.env.DEV) return
  console.log(
    `[LIFECYCLE_RESET] ${reason}${detail ? ` — ${detail}` : ""}`
  )
}

export function logTransferFinalized(transferId: string, role: string): void {
  if (!import.meta.env.DEV) return
  console.log(
    `[TRANSFER_FINALIZED] ${transferId.slice(0, 8)}… role=${role}`
  )
}

export function logReconstructReset(): void {
  if (!import.meta.env.DEV) return
  console.log("[RECONSTRUCT_RESET] locks cleared")
}

export function logSessionReleased(transferId?: string): void {
  if (!import.meta.env.DEV) return
  console.log(
    `[SESSION_RELEASED]${transferId ? ` ${transferId.slice(0, 8)}…` : ""}`
  )
}

export function logRoleSwap(from: string, to: string): void {
  if (!import.meta.env.DEV) return
  console.log(`[ROLE_SWAP] ${from} → ${to}`)
}
