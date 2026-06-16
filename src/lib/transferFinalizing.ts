import { FINALIZING_OVERLAY_MIN_BYTES } from "@/lib/transferLimits"
import type { IncomingFileChunkState } from "@/types/device"

/**
 * Whether to show the premium finalizing overlay before blob reconstruction.
 */
export function shouldShowFinalizingOverlay(
  totalBytes: number,
  incomingFileChunks: Record<string, IncomingFileChunkState>
): boolean {
  if (totalBytes >= FINALIZING_OVERLAY_MIN_BYTES) {
    return true
  }

  return Object.values(incomingFileChunks).some(
    (entry) => entry.metadata.size >= FINALIZING_OVERLAY_MIN_BYTES
  )
}

/**
 * Yield until after the overlay can paint, then run heavy work.
 */
export function scheduleAfterOverlayPaint(work: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(work, 0)
    })
  })
}
