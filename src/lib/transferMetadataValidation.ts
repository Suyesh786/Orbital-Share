import type { TransferMetadataPayload } from "@/types/websocket"
import {
  ALLOW_EMPTY_FILES,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_TRANSFER_BYTES,
} from "@/lib/transferLimits"

export interface MetadataValidationResult {
  valid: boolean
  reason?: string
}

export function validateTransferMetadata(
  payload: TransferMetadataPayload,
  expectedTransferId: string
): MetadataValidationResult {
  if (!payload.transferId || payload.transferId !== expectedTransferId) {
    return { valid: false, reason: "transferId mismatch" }
  }

  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    return { valid: false, reason: "no files in metadata" }
  }

  if (payload.files.length > MAX_FILE_COUNT) {
    return { valid: false, reason: "file count exceeds limit" }
  }

  let computedTotal = 0
  const seenIds = new Set<string>()

  for (const file of payload.files) {
    if (
      !file ||
      typeof file.fileId !== "string" ||
      !file.fileId.trim() ||
      typeof file.name !== "string" ||
      !file.name.trim() ||
      typeof file.size !== "number" ||
      !Number.isFinite(file.size) ||
      file.size < 0
    ) {
      return { valid: false, reason: "invalid file entry" }
    }

    if (seenIds.has(file.fileId)) {
      return { valid: false, reason: "duplicate fileId" }
    }
    seenIds.add(file.fileId)

    if (!ALLOW_EMPTY_FILES && file.size === 0) {
      return { valid: false, reason: "empty file in metadata" }
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, reason: "file size exceeds limit" }
    }

    computedTotal += file.size
  }

  if (computedTotal > MAX_TOTAL_TRANSFER_BYTES) {
    return { valid: false, reason: "total size exceeds limit" }
  }

  const declaredTotal =
    typeof payload.totalBytes === "number" && payload.totalBytes >= 0
      ? payload.totalBytes
      : computedTotal

  if (Math.abs(declaredTotal - computedTotal) > 1) {
    return { valid: false, reason: "totalBytes mismatch" }
  }

  return { valid: true }
}
