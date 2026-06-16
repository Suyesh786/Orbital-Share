/** Binary chunk wire format: [type u8][headerLen u32 LE][header JSON UTF-8][raw bytes] */

export const CHUNK_MESSAGE_TYPE = 1
export const TRANSFER_CHUNK_SIZE = 64 * 1024

export interface FileChunkHeader {
  transferId: string
  fileId: string
  chunkIndex: number
  totalChunks: number
}

export interface DecodedFileChunk extends FileChunkHeader {
  data: Uint8Array
}

export function encodeFileChunk(
  header: FileChunkHeader,
  data: Uint8Array
): ArrayBuffer {
  const headerJson = JSON.stringify(header)
  const headerBytes = new TextEncoder().encode(headerJson)
  const packet = new ArrayBuffer(1 + 4 + headerBytes.length + data.byteLength)
  const view = new DataView(packet)
  view.setUint8(0, CHUNK_MESSAGE_TYPE)
  view.setUint32(1, headerBytes.length, true)
  new Uint8Array(packet, 5, headerBytes.length).set(headerBytes)
  new Uint8Array(packet, 5 + headerBytes.length).set(data)
  return packet
}

export function decodeFileChunk(buffer: ArrayBuffer): DecodedFileChunk | null {
  if (buffer.byteLength < 5) return null

  const view = new DataView(buffer)
  if (view.getUint8(0) !== CHUNK_MESSAGE_TYPE) return null

  const headerLen = view.getUint32(1, true)
  const headerStart = 5
  const dataStart = headerStart + headerLen
  if (dataStart > buffer.byteLength || headerLen === 0) return null

  try {
    const headerJson = new TextDecoder().decode(
      new Uint8Array(buffer, headerStart, headerLen)
    )
    const parsed = JSON.parse(headerJson) as FileChunkHeader
    if (
      typeof parsed.transferId !== "string" ||
      typeof parsed.fileId !== "string" ||
      typeof parsed.chunkIndex !== "number" ||
      typeof parsed.totalChunks !== "number"
    ) {
      return null
    }

    return {
      transferId: parsed.transferId,
      fileId: parsed.fileId,
      chunkIndex: parsed.chunkIndex,
      totalChunks: parsed.totalChunks,
      data: new Uint8Array(buffer, dataStart),
    }
  } catch {
    return null
  }
}

export function getChunkCountForFileSize(size: number): number {
  if (size <= 0) return 1
  return Math.ceil(size / TRANSFER_CHUNK_SIZE)
}
