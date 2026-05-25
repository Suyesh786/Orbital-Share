import { formatLimitSize } from "@/lib/transferLimits"
import {
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_TRANSFER_BYTES,
} from "@/lib/transferLimits"

export const TRANSFER_USER_MESSAGES = {
  fileTooLarge: `File exceeds maximum allowed size (${formatLimitSize(MAX_FILE_SIZE_BYTES)})`,
  totalTooLarge: `Total transfer exceeds maximum allowed size (${formatLimitSize(MAX_TOTAL_TRANSFER_BYTES)})`,
  tooManyFiles: `Too many files selected (maximum ${MAX_FILE_COUNT})`,
  noFilesSelected: "Select at least one file to continue",
  transferCancelled: "Transfer cancelled",
  receiverDisconnected: "Receiver disconnected",
  senderDisconnected: "Sender disconnected",
  transferFailed: "Transfer failed",
  invalidSession: "Invalid transfer session",
  invalidMetadata: "Transfer could not start due to invalid file data",
  requestTimedOut: "Request timed out. You can try again.",
  peerCancelled: "The other device cancelled the transfer",
} as const

/**
 * Map server/session close reasons to user-safe copy.
 */
export function humanizeCloseReason(reason: string): string {
  const lower = reason.toLowerCase()
  if (lower.includes("disconnect")) {
    if (lower.includes("receiver")) return TRANSFER_USER_MESSAGES.receiverDisconnected
    if (lower.includes("sender")) return TRANSFER_USER_MESSAGES.senderDisconnected
    return TRANSFER_USER_MESSAGES.receiverDisconnected
  }
  if (lower.includes("cancel") || lower.includes("abort")) {
    return TRANSFER_USER_MESSAGES.transferCancelled
  }
  if (lower.includes("timeout")) {
    return TRANSFER_USER_MESSAGES.requestTimedOut
  }
  if (lower.includes("invalid") || lower.includes("malformed")) {
    return TRANSFER_USER_MESSAGES.invalidSession
  }
  if (lower.includes("declined") || lower.includes("rejected")) {
    return "Receiver declined your request"
  }
  return TRANSFER_USER_MESSAGES.transferFailed
}

export function humanizeRejectReason(reason?: string): string {
  if (!reason) return "Receiver declined your request"
  const lower = reason.toLowerCase()
  if (lower.includes("busy")) return "Receiver is busy. Try again shortly."
  if (lower.includes("timeout")) return TRANSFER_USER_MESSAGES.requestTimedOut
  if (lower.includes("size") || lower.includes("limit")) {
    return reason
  }
  if (lower.includes("invalid")) return TRANSFER_USER_MESSAGES.invalidSession
  return humanizeCloseReason(reason)
}
