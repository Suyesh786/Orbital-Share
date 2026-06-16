import type { PerFileTransferProgress, PerFileTransferStatus } from "@/types/device"

export function buildInitialPerFileProgress(
  files: Array<{ fileId: string; name: string; size: number }>
): {
  perFileTransferProgress: Record<string, PerFileTransferProgress>
  perFileProgressOrder: string[]
} {
  const perFileTransferProgress: Record<string, PerFileTransferProgress> = {}
  const perFileProgressOrder: string[] = []

  for (const file of files) {
    perFileProgressOrder.push(file.fileId)
    perFileTransferProgress[file.fileId] = {
      fileId: file.fileId,
      name: file.name,
      totalBytes: file.size,
      transferredBytes: 0,
      percentage: 0,
      status: "waiting",
    }
  }

  return { perFileTransferProgress, perFileProgressOrder }
}

function resolveStatus(
  transferredBytes: number,
  totalBytes: number
): PerFileTransferStatus {
  if (totalBytes > 0 && transferredBytes >= totalBytes) {
    return "completed"
  }
  if (transferredBytes > 0) {
    return "transferring"
  }
  return "waiting"
}

export function updatePerFileProgressEntry(
  entry: PerFileTransferProgress,
  transferredBytes: number
): PerFileTransferProgress {
  const totalBytes = entry.totalBytes
  const percentage =
    totalBytes > 0 ? Math.min(100, (transferredBytes / totalBytes) * 100) : 0

  return {
    ...entry,
    transferredBytes,
    percentage,
    status: resolveStatus(transferredBytes, totalBytes),
  }
}

export function patchPerFileProgress(
  record: Record<string, PerFileTransferProgress>,
  fileId: string,
  transferredBytes: number
): Record<string, PerFileTransferProgress> {
  const entry = record[fileId]
  if (!entry) return record

  return {
    ...record,
    [fileId]: updatePerFileProgressEntry(entry, transferredBytes),
  }
}
