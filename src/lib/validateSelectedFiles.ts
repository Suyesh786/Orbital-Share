import {
  ALLOW_EMPTY_FILES,
  MAX_FILE_COUNT,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_TRANSFER_BYTES,
  formatLimitSize,
} from "@/lib/transferLimits"
import { TRANSFER_USER_MESSAGES } from "@/lib/transferUserMessages"

export interface FileRejection {
  name: string
  reason: string
}

export interface FileValidationResult {
  valid: boolean
  acceptedFiles: File[]
  rejected: FileRejection[]
  errors: string[]
  totalBytes: number
  activeCount: number
}

function isValidFile(file: File): boolean {
  return (
    file instanceof File &&
    typeof file.name === "string" &&
    file.name.length > 0 &&
    Number.isFinite(file.size) &&
    file.size >= 0
  )
}

/**
 * Validate files for transfer (size, count, totals, empty files).
 */
export function validateFilesForTransfer(files: File[]): FileValidationResult {
  const errors: string[] = []
  const rejected: FileRejection[] = []
  const acceptedFiles: File[] = []
  const seen = new Set<string>()

  if (files.length === 0) {
    return {
      valid: false,
      acceptedFiles: [],
      rejected: [],
      errors: [TRANSFER_USER_MESSAGES.noFilesSelected],
      totalBytes: 0,
      activeCount: 0,
    }
  }

  if (files.length > MAX_FILE_COUNT) {
    errors.push(TRANSFER_USER_MESSAGES.tooManyFiles)
  }

  let totalBytes = 0

  for (const file of files) {
    if (!isValidFile(file)) {
      rejected.push({
        name: file?.name ?? "Unknown file",
        reason: "Invalid file",
      })
      continue
    }

    const dedupeKey = `${file.name}\0${file.size}\0${file.lastModified}`
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)

    if (!ALLOW_EMPTY_FILES && file.size === 0) {
      rejected.push({ name: file.name, reason: "Empty file not allowed" })
      continue
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      rejected.push({
        name: file.name,
        reason: TRANSFER_USER_MESSAGES.fileTooLarge,
      })
      continue
    }

    acceptedFiles.push(file)
    totalBytes += file.size
  }

  if (acceptedFiles.length > MAX_FILE_COUNT) {
    errors.push(TRANSFER_USER_MESSAGES.tooManyFiles)
  }

  if (totalBytes > MAX_TOTAL_TRANSFER_BYTES) {
    errors.push(
      `${TRANSFER_USER_MESSAGES.totalTooLarge} (${formatLimitSize(totalBytes)} selected)`
    )
  }

  const valid =
    errors.length === 0 &&
    acceptedFiles.length > 0 &&
    acceptedFiles.length <= MAX_FILE_COUNT &&
    totalBytes <= MAX_TOTAL_TRANSFER_BYTES

  return {
    valid,
    acceptedFiles,
    rejected,
    errors,
    totalBytes,
    activeCount: acceptedFiles.length,
  }
}

/**
 * Validate adding new files onto an existing selection.
 */
export function validateFilesToAdd(
  existingFiles: File[],
  incomingFiles: File[]
): FileValidationResult {
  const slotsLeft = MAX_FILE_COUNT - existingFiles.length

  if (slotsLeft <= 0) {
    return {
      valid: false,
      acceptedFiles: [],
      rejected: incomingFiles.map((file) => ({
        name: file.name,
        reason: TRANSFER_USER_MESSAGES.tooManyFiles,
      })),
      errors: [TRANSFER_USER_MESSAGES.tooManyFiles],
      totalBytes: existingFiles.reduce((sum, f) => sum + f.size, 0),
      activeCount: existingFiles.length,
    }
  }

  const cappedIncoming = incomingFiles.slice(0, slotsLeft)
  const overflow = incomingFiles.slice(slotsLeft)

  const result = validateFilesForTransfer([...existingFiles, ...cappedIncoming])

  for (const file of overflow) {
    result.rejected.push({
      name: file.name,
      reason: TRANSFER_USER_MESSAGES.tooManyFiles,
    })
  }

  if (overflow.length > 0 && !result.errors.includes(TRANSFER_USER_MESSAGES.tooManyFiles)) {
    result.errors.push(TRANSFER_USER_MESSAGES.tooManyFiles)
    result.valid = false
  }

  return result
}

/**
 * Validate currently selected active files before starting discovery/request.
 */
export function validateActiveSelection(
  selectedFiles: Array<{ file: File; selected: boolean }>
): FileValidationResult {
  const active = selectedFiles.filter((entry) => entry.selected).map((entry) => entry.file)
  return validateFilesForTransfer(active)
}
