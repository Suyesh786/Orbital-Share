import { TRANSFER_CHUNK_SIZE } from "@/lib/transferBinaryProtocol"
import { formatFileSize } from "@/lib/format"

/** Maximum size per file (5 GB) */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024

/** Maximum combined size for one transfer batch (10 GB) */
export const MAX_TOTAL_TRANSFER_BYTES = 10 * 1024 * 1024 * 1024

/** Maximum files per transfer */
export const MAX_FILE_COUNT = 500

/** Allow zero-byte files in transfers */
export const ALLOW_EMPTY_FILES = true

/** Largest acceptable single chunk payload (chunk size + small overhead) */
export const MAX_CHUNK_BYTES = TRANSFER_CHUNK_SIZE + 4096

/** Client outgoing request timeout (aligned with Phase 4.1 server) */
export const OUTGOING_REQUEST_TIMEOUT_MS = 45_000

/** Show finalizing overlay when total or any file exceeds this (256 MB) */
export const FINALIZING_OVERLAY_MIN_BYTES = 256 * 1024 * 1024

export function formatLimitSize(bytes: number): string {
  return formatFileSize(bytes)
}
