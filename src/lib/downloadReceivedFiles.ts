import {
  getDesktopApi,
  type ReceivedFileSaveResult,
} from "@/lib/electron"
import type { ReceivedFileMemory } from "@/types/device"

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function getDownloadableFiles(
  receivedFilesMemory: Record<string, ReceivedFileMemory>,
  fileIds?: string[]
): ReceivedFileMemory[] {
  const all = Object.values(receivedFilesMemory).filter(
    (entry) => entry.completed && entry.blob.size > 0
  )

  if (!fileIds || fileIds.length === 0) {
    return all
  }

  const idSet = new Set(fileIds)
  return all.filter((entry) => idSet.has(entry.fileId))
}

/**
 * Download all reconstructed in-memory files (preserves original filenames).
 */
export function downloadAllReceivedFiles(
  receivedFilesMemory: Record<string, ReceivedFileMemory>
): number {
  const files = getDownloadableFiles(receivedFilesMemory)
  if (files.length === 0) return 0

  for (const file of files) {
    triggerBlobDownload(file.blob, file.name)
  }

  return files.length
}

/**
 * Download only the selected reconstructed files by fileId.
 */
export function downloadSelectedReceivedFiles(
  receivedFilesMemory: Record<string, ReceivedFileMemory>,
  fileIds: string[]
): number {
  const files = getDownloadableFiles(receivedFilesMemory, fileIds)
  if (files.length === 0) return 0

  for (const file of files) {
    triggerBlobDownload(file.blob, file.name)
  }

  return files.length
}

export async function saveReceivedFilesToDownloads(
  receivedFilesMemory: Record<string, ReceivedFileMemory>
): Promise<ReceivedFileSaveResult> {
  const files = getDownloadableFiles(receivedFilesMemory)
  if (files.length === 0) {
    return {
      savedCount: 0,
      directory: null,
    }
  }

  const desktopApi = getDesktopApi()
  if (!desktopApi) {
    for (const file of files) {
      triggerBlobDownload(file.blob, file.name)
    }

    return {
      savedCount: files.length,
      directory: null,
    }
  }

  const payload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      bytes: await file.blob.arrayBuffer(),
    }))
  )

  return desktopApi.saveReceivedFilesToDownloads(payload)
}
