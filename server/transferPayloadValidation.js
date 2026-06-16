import {
  ALLOW_EMPTY_FILES,
  MAX_CHUNK_BYTES,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_TRANSFER_BYTES,
  TRANSFER_CHUNK_SIZE,
} from "./transferLimits.js"

/**
 * @param {Array<{ name: string, size: number, type: string }>} files
 * @returns {{ valid: boolean, reason?: string, totalBytes: number }}
 */
export function validateOutboundFileList(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { valid: false, reason: "No files in request", totalBytes: 0 }
  }

  if (files.length > MAX_FILE_COUNT) {
    return { valid: false, reason: "Too many files", totalBytes: 0 }
  }

  let totalBytes = 0

  for (const file of files) {
    if (
      !file ||
      typeof file.name !== "string" ||
      !file.name.trim() ||
      typeof file.size !== "number" ||
      !Number.isFinite(file.size) ||
      file.size < 0
    ) {
      return { valid: false, reason: "Invalid file metadata", totalBytes: 0 }
    }

    if (!ALLOW_EMPTY_FILES && file.size === 0) {
      return { valid: false, reason: "Empty file not allowed", totalBytes: 0 }
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, reason: "File exceeds maximum allowed size", totalBytes: 0 }
    }

    totalBytes += file.size
  }

  if (totalBytes > MAX_TOTAL_TRANSFER_BYTES) {
    return { valid: false, reason: "Total transfer exceeds maximum allowed size", totalBytes }
  }

  return { valid: true, totalBytes }
}

/**
 * @param {{ transferId: string, files: Array<{ fileId: string, name: string, size: number, type: string }>, totalBytes: number }} parsed
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateTransferMetadataPayload(parsed) {
  if (!parsed?.transferId || !Array.isArray(parsed.files) || parsed.files.length === 0) {
    return { valid: false, reason: "Invalid metadata payload" }
  }

  if (parsed.files.length > MAX_FILE_COUNT) {
    return { valid: false, reason: "Too many files in metadata" }
  }

  let computed = 0
  const ids = new Set()

  for (const file of parsed.files) {
    if (
      !file?.fileId ||
      typeof file.name !== "string" ||
      !file.name.trim() ||
      typeof file.size !== "number" ||
      !Number.isFinite(file.size) ||
      file.size < 0
    ) {
      return { valid: false, reason: "Invalid file entry in metadata" }
    }

    if (ids.has(file.fileId)) {
      return { valid: false, reason: "Duplicate fileId in metadata" }
    }
    ids.add(file.fileId)

    if (!ALLOW_EMPTY_FILES && file.size === 0) {
      return { valid: false, reason: "Empty file in metadata" }
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { valid: false, reason: "File size exceeds limit" }
    }

    computed += file.size
  }

  if (computed > MAX_TOTAL_TRANSFER_BYTES) {
    return { valid: false, reason: "Total size exceeds limit" }
  }

  const declared =
    typeof parsed.totalBytes === "number" && parsed.totalBytes >= 0
      ? parsed.totalBytes
      : computed

  if (Math.abs(declared - computed) > 1) {
    return { valid: false, reason: "totalBytes mismatch" }
  }

  return { valid: true }
}

/**
 * Quick sanity check on relayed binary chunk size.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isReasonableChunkPacket(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false
  if (buffer[0] !== 1) return false
  const headerLen = buffer.readUInt32LE(1)
  const dataLen = buffer.length - 5 - headerLen
  if (headerLen <= 0 || dataLen < 0) return false
  if (buffer.length > MAX_CHUNK_BYTES + 512) return false
  if (dataLen > MAX_CHUNK_BYTES) return false
  return true
}

/**
 * @param {number} fileSize
 * @returns {number}
 */
export function getChunkCountForFileSize(fileSize) {
  if (fileSize <= 0) return 1
  return Math.ceil(fileSize / TRANSFER_CHUNK_SIZE)
}
