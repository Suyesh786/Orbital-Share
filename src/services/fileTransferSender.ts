import {
  encodeFileChunk,
  getChunkCountForFileSize,
  TRANSFER_CHUNK_SIZE,
} from "@/lib/transferBinaryProtocol"
import { websocketService } from "@/services/websocket"
import type { TransferMetadataFileEntry } from "@/types/websocket"

export interface OutgoingTransferFile {
  fileId: string
  name: string
  size: number
  type: string
  file: File
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

async function readFileChunk(file: File, chunkIndex: number): Promise<Uint8Array> {
  const start = chunkIndex * TRANSFER_CHUNK_SIZE
  const end = Math.min(start + TRANSFER_CHUNK_SIZE, file.size)
  if (end <= start) {
    return new Uint8Array(0)
  }
  const slice = file.slice(start, end)
  const buffer = await slice.arrayBuffer()
  return new Uint8Array(buffer)
}

export type OutgoingChunkProgress = {
  bytesSent: number
  totalBytes: number
  fileId: string
  fileBytesSent: number
  fileTotalBytes: number
}

export type StreamOutgoingResult = "completed" | "aborted" | "failed"

export async function streamOutgoingFiles(
  transferId: string,
  files: OutgoingTransferFile[],
  onProgress: (progress: OutgoingChunkProgress) => void,
  options?: { shouldAbort?: () => boolean }
): Promise<StreamOutgoingResult> {
  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0)
  let bytesSent = 0

  for (const entry of files) {
    if (options?.shouldAbort?.()) return "aborted"

    const totalChunks = getChunkCountForFileSize(entry.size)
    let fileBytesSent = 0

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (options?.shouldAbort?.()) return "aborted"

      const chunkData = await readFileChunk(entry.file, chunkIndex)

      const packet = encodeFileChunk(
        {
          transferId,
          fileId: entry.fileId,
          chunkIndex,
          totalChunks,
        },
        chunkData
      )

      const sent = await websocketService.sendBinary(packet)
      if (!sent) return "failed"

      bytesSent += chunkData.byteLength
      fileBytesSent += chunkData.byteLength
      onProgress({
        bytesSent,
        totalBytes,
        fileId: entry.fileId,
        fileBytesSent,
        fileTotalBytes: entry.size,
      })
      await yieldToMain()
    }
  }

  return "completed"
}

export function buildOutgoingTransferFiles(
  files: File[]
): OutgoingTransferFile[] {
  return files.map((file) => ({
    fileId: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    file,
  }))
}

export function toMetadataEntries(
  files: OutgoingTransferFile[]
): TransferMetadataFileEntry[] {
  return files.map(({ fileId, name, size, type }) => ({
    fileId,
    name,
    size,
    type,
  }))
}
