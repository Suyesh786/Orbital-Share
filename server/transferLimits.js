/** @see src/lib/transferLimits.ts — keep in sync */

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024
export const MAX_TOTAL_TRANSFER_BYTES = 10 * 1024 * 1024 * 1024
export const MAX_FILE_COUNT = 500
export const ALLOW_EMPTY_FILES = true
export const TRANSFER_CHUNK_SIZE = 64 * 1024
export const MAX_CHUNK_BYTES = TRANSFER_CHUNK_SIZE + 4096
