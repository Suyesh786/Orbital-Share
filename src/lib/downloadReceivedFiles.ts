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

/**
 * Download all reconstructed in-memory files (preserves original filenames).
 */
export function downloadAllReceivedFiles(
  receivedFilesMemory: Record<string, ReceivedFileMemory>
): number {
  const files = Object.values(receivedFilesMemory).filter(
    (entry) => entry.completed && entry.blob.size > 0
  )

  if (files.length === 0) return 0

  for (const file of files) {
    triggerBlobDownload(file.blob, file.name)
  }

  return files.length
}
