import type { TransferSessionStatus } from "@/types/device"

/** Clears in-progress transfer buffers (memory safety on cancel/failure). */
export const PARTIAL_TRANSFER_CLEAR = {
  incomingFileChunks: {} as Record<string, never>,
  receivedFilesMemory: {} as Record<string, never>,
  perFileTransferProgress: {} as Record<string, never>,
  perFileProgressOrder: [] as string[],
  selectedCompletedFileIds: {} as Record<string, never>,
  incomingFilesMetadata: [] as never[],
  bytesTransferred: 0,
  transferProgress: 0,
  transferSpeed: 0,
  estimatedTimeRemaining: 0,
  activeTransferTotalBytes: 0,
  transferSessionStatus: null as TransferSessionStatus | null,
  isFinalizingTransfer: false,
  isReconstructingFiles: false,
  activeTransferSessionToken: "",
} as const
