import type { DecodedFileChunk } from "@/lib/transferBinaryProtocol"
import {
  getChunkCountForFileSize,
  TRANSFER_CHUNK_SIZE,
} from "@/lib/transferBinaryProtocol"
import { MAX_CHUNK_BYTES } from "@/lib/transferLimits"
import type { IncomingFileChunkState } from "@/types/device"

export interface ChunkValidationContext {
  activeTransferId: string
  incomingFileChunks: Record<string, IncomingFileChunkState>
}

export interface ChunkValidationResult {
  valid: boolean
  reason?: string
}

export function validateIncomingChunk(
  chunk: DecodedFileChunk,
  context: ChunkValidationContext
): ChunkValidationResult {
  if (!chunk.transferId || chunk.transferId !== context.activeTransferId) {
    return { valid: false, reason: "transferId mismatch" }
  }

  if (!chunk.fileId || typeof chunk.fileId !== "string") {
    return { valid: false, reason: "missing fileId" }
  }

  const entry = context.incomingFileChunks[chunk.fileId]
  if (!entry) {
    return { valid: false, reason: "unknown fileId" }
  }

  if (
    !Number.isInteger(chunk.chunkIndex) ||
    !Number.isInteger(chunk.totalChunks) ||
    chunk.chunkIndex < 0 ||
    chunk.totalChunks < 1
  ) {
    return { valid: false, reason: "invalid chunk indexes" }
  }

  if (chunk.chunkIndex >= chunk.totalChunks) {
    return { valid: false, reason: "chunkIndex out of range" }
  }

  const expectedChunks = getChunkCountForFileSize(entry.metadata.size)
  if (chunk.totalChunks !== expectedChunks) {
    return { valid: false, reason: "totalChunks mismatch" }
  }

  if (chunk.chunkIndex >= entry.totalChunks) {
    return { valid: false, reason: "chunkIndex exceeds file totalChunks" }
  }

  if (!chunk.data || chunk.data.byteLength === 0) {
    if (entry.metadata.size > 0) {
      return { valid: false, reason: "empty chunk payload" }
    }
  }

  if (chunk.data.byteLength > MAX_CHUNK_BYTES) {
    return { valid: false, reason: "chunk payload too large" }
  }

  const isLastChunk = chunk.chunkIndex === chunk.totalChunks - 1
  const maxExpected =
    isLastChunk && entry.metadata.size > 0
      ? entry.metadata.size - (chunk.totalChunks - 1) * TRANSFER_CHUNK_SIZE
      : TRANSFER_CHUNK_SIZE

  if (chunk.data.byteLength > maxExpected + 64) {
    return { valid: false, reason: "chunk size exceeds expected bounds" }
  }

  return { valid: true }
}
