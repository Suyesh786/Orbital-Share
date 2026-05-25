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

export async function streamOutgoingFiles(
  transferId: string,
  files: OutgoingTransferFile[],
  onBytesSent: (bytesSent: number, totalBytes: number) => void
): Promise<boolean> {
  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0)
  let bytesSent = 0

  for (const entry of files) {
    const buffer = await entry.file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const totalChunks = getChunkCountForFileSize(entry.size)

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * TRANSFER_CHUNK_SIZE
      const end = Math.min(start + TRANSFER_CHUNK_SIZE, bytes.byteLength)
      const chunkData =
        end > start ? bytes.subarray(start, end) : new Uint8Array(0)

      const packet = encodeFileChunk(
        {
          transferId,
          fileId: entry.fileId,
          chunkIndex,
          totalChunks,
        },
        chunkData
      )

      const sent = websocketService.sendBinary(packet)
      if (!sent) return false

      bytesSent += chunkData.byteLength
      onBytesSent(bytesSent, totalBytes)
      await yieldToMain()
    }
  }

  return true
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
