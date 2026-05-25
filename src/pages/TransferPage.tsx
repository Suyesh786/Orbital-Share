import { useCallback, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Download, File } from "lucide-react"
import { OverallTransferProgress } from "@/components/transfer/OverallTransferProgress"
import { PerFileTransferProgressList } from "@/components/transfer/PerFileTransferProgressList"
import { ReceivedFileSelectionList } from "@/components/transfer/ReceivedFileSelectionList"
import { TransferCompleteHeader } from "@/components/transfer/TransferCompleteHeader"
import { useNavigate } from "react-router-dom"
import { BackButton } from "@/components/shared/BackButton"
import { GlowButton } from "@/components/shared/GlowButton"
import { getFileIcon } from "@/lib/fileIcon"
import { getActiveSelectedFiles } from "@/store/transferUtils"
import {
  selectActiveFileCount,
  selectActiveTransferPeerUsername,
  selectActiveTransferTotalBytes,
  selectBytesTransferred,
  selectCompletionSummary,
  selectDownloadSelectedReceivedFiles,
  selectEstimatedTimeRemaining,
  selectPerFileProgressOrder,
  selectPerFileTransferProgress,
  selectReceivedFilesMemory,
  selectSelectedCompletedFileIds,
  selectToggleCompletedFileSelection,
  selectReceivedFileCount,
  selectExitTransferToDiscovery,
  selectHasActiveTransferSession,
  selectHasCompletionSummary,
  selectIncomingFileCount,
  selectIncomingFilesTotalSize,
  selectMode,
  selectResetTransferFlow,
  selectSelectedFiles,
  selectSelectedReceiverUsername,
  selectShowTransferComplete,
  selectStartOutgoingFileTransfer,
  selectTransferProgress,
  selectTransferSessionStatus,
  selectTransferSpeed,
  selectTransferState,
  useTransferStore,
} from "@/store/useTransferStore"
import type { PerFileTransferProgress } from "@/types/device"
import { cn } from "@/lib/utils"

function transferStatusLabel(status: string, isReceiver: boolean): string {
  switch (status) {
    case "connecting":
      return "Connecting…"
    case "metadata":
      return isReceiver ? "Receiving file metadata…" : "Sending file metadata…"
    case "transferring":
      return "Transferring"
    case "reconstructing":
      return "Reconstructing files…"
    default:
      return "Transferring"
  }
}

function resolveActiveTransferFileName(
  perFileProgressOrder: string[],
  perFileTransferProgress: Record<string, PerFileTransferProgress>,
  transferSessionStatus: string,
  fallback: string
): string {
  if (perFileProgressOrder.length === 0) return fallback

  const transferring = perFileProgressOrder
    .map((id) => perFileTransferProgress[id])
    .find((entry) => entry?.status === "transferring")
  if (transferring) return transferring.name

  if (transferSessionStatus === "reconstructing") {
    return "Assembling received files…"
  }

  const nextWaiting = perFileProgressOrder
    .map((id) => perFileTransferProgress[id])
    .find((entry) => entry?.status === "waiting")
  if (nextWaiting) return nextWaiting.name

  const lastId = perFileProgressOrder[perFileProgressOrder.length - 1]
  const lastEntry = lastId ? perFileTransferProgress[lastId] : undefined
  if (lastEntry?.status === "completed") return lastEntry.name

  return fallback
}

export function TransferPage() {
  const navigate = useNavigate()
  const selectedFiles = useTransferStore(selectSelectedFiles)
  const activeFileCount = useTransferStore(selectActiveFileCount)
  const activeFiles = useMemo(
    () => getActiveSelectedFiles(selectedFiles),
    [selectedFiles]
  )
  const mode = useTransferStore(selectMode)
  const completionSummary = useTransferStore(selectCompletionSummary)
  const hasCompletionSummary = useTransferStore(selectHasCompletionSummary)
  const receiverUsername = useTransferStore(selectSelectedReceiverUsername)
  const peerUsername = useTransferStore(selectActiveTransferPeerUsername)
  const incomingFileCount = useTransferStore(selectIncomingFileCount)
  const incomingFilesTotalSize = useTransferStore(selectIncomingFilesTotalSize)
  const bytesTransferred = useTransferStore(selectBytesTransferred)
  const showTransferComplete = useTransferStore(selectShowTransferComplete)
  const activeTransferTotalBytes = useTransferStore(selectActiveTransferTotalBytes)
  const hasActiveSession = useTransferStore(selectHasActiveTransferSession)
  const transferSessionStatus = useTransferStore(selectTransferSessionStatus)
  const resetTransferFlow = useTransferStore(selectResetTransferFlow)
  const downloadSelectedReceivedFiles = useTransferStore(
    selectDownloadSelectedReceivedFiles
  )
  const receivedFilesMemory = useTransferStore(selectReceivedFilesMemory)
  const selectedCompletedFileIds = useTransferStore(selectSelectedCompletedFileIds)
  const toggleCompletedFileSelection = useTransferStore(
    selectToggleCompletedFileSelection
  )
  const perFileProgressOrder = useTransferStore(selectPerFileProgressOrder)
  const perFileTransferProgress = useTransferStore(selectPerFileTransferProgress)
  const receivedFileCount = useTransferStore(selectReceivedFileCount)
  const startOutgoingFileTransfer = useTransferStore(selectStartOutgoingFileTransfer)
  const transferState = useTransferStore(selectTransferState)
  const progress = useTransferStore(selectTransferProgress)
  const speed = useTransferStore(selectTransferSpeed)
  const estimatedTimeRemaining = useTransferStore(selectEstimatedTimeRemaining)
  const exitTransferToDiscovery = useTransferStore(selectExitTransferToDiscovery)

  const transferStartedRef = useRef(false)
  const complete = hasCompletionSummary

  useEffect(() => {
    if (!hasActiveSession || mode !== "sender" || hasCompletionSummary) return
    if (transferSessionStatus !== "connecting") return
    if (transferStartedRef.current) return

    transferStartedRef.current = true
    void startOutgoingFileTransfer()
  }, [
    hasActiveSession,
    mode,
    hasCompletionSummary,
    transferSessionStatus,
    startOutgoingFileTransfer,
  ])

  useEffect(() => {
    return () => {
      transferStartedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (hasActiveSession || showTransferComplete) return

    if (mode === "sender") {
      navigate("/discovery", { replace: true })
      return
    }
    if (mode === "receiver") {
      navigate("/waiting", { replace: true })
      return
    }
    navigate("/", { replace: true })
  }, [hasActiveSession, showTransferComplete, mode, navigate])

  const isReceiver = mode === "receiver"
  const isSender = mode === "sender"
  const displayPeerName = isReceiver
    ? peerUsername
    : receiverUsername || peerUsername
  const effectiveFileCount = isReceiver ? incomingFileCount : activeFileCount
  const effectiveTotalSize =
    activeTransferTotalBytes > 0
      ? activeTransferTotalBytes
      : isReceiver
        ? incomingFilesTotalSize
        : activeFiles.reduce((sum, entry) => sum + entry.file.size, 0)
  const currentFile = activeFiles[0]?.file
  const statusLabel = transferStatusLabel(transferSessionStatus, isReceiver)

  const fileCountFallback = isReceiver
    ? `${effectiveFileCount} incoming file${effectiveFileCount !== 1 ? "s" : ""}`
    : (currentFile?.name ?? "Files")

  const activeTransferFileName = useMemo(
    () =>
      resolveActiveTransferFileName(
        perFileProgressOrder,
        perFileTransferProgress,
        transferSessionStatus,
        fileCountFallback
      ),
    [
      perFileProgressOrder,
      perFileTransferProgress,
      transferSessionStatus,
      fileCountFallback,
    ]
  )

  const handleBack = useCallback(() => {
    exitTransferToDiscovery()
    navigate("/discovery")
  }, [exitTransferToDiscovery, navigate])

  const handleDone = () => {
    resetTransferFlow()
    navigate("/", { replace: true })
  }

  const handleExit = () => {
    resetTransferFlow()
    navigate("/", { replace: true })
  }

  const summaryMode = completionSummary?.mode
  const summaryFileCount = completionSummary?.fileCount ?? 0
  const summaryFileNames = completionSummary?.fileNames ?? []
  const summaryPeerUsername = completionSummary?.peerUsername

  const receivedFilesList = useMemo(
    () => Object.values(receivedFilesMemory),
    [receivedFilesMemory]
  )

  const selectedDownloadCount = useMemo(
    () =>
      Object.entries(selectedCompletedFileIds).filter(([, selected]) => selected)
        .length,
    [selectedCompletedFileIds]
  )

  const downloadButtonLabel = useMemo(() => {
    if (selectedDownloadCount === 0) {
      return "Select files to download"
    }
    if (selectedDownloadCount === 1) {
      return "Download Selected File"
    }
    return `Download Selected Files (${selectedDownloadCount})`
  }, [selectedDownloadCount])

  const handleDownloadSelected = () => {
    if (selectedDownloadCount === 0) return
    downloadSelectedReceivedFiles()
  }

  const canDownloadReceived =
    summaryMode === "receiver" && receivedFileCount > 0

  const showPerFileProgress =
    !complete && perFileProgressOrder.length > 0 && hasActiveSession

  return (
    <div
      className={cn(
        "flex h-full flex-col px-6",
        complete
          ? "items-center justify-center"
          : "items-center justify-start overflow-y-auto pt-14 pb-10"
      )}
    >
      <div className="absolute left-6 top-0">
        {!complete && isSender && <BackButton onBack={handleBack} />}
      </div>

      <AnimatePresence mode="wait">
        {!complete ? (
          <motion.div
            key="transferring"
            className="flex w-full max-w-sm flex-col"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-2xl glass-panel glow-cyan">
                <File className="size-6 text-cyan-400" />
              </div>

              <h1 className="text-lg font-semibold text-white">{statusLabel}</h1>
              <p className="mt-2 max-w-[280px] truncate text-sm font-medium text-cyan-300/80">
                {activeTransferFileName}
              </p>
              {displayPeerName && (
                <p className="mt-1 text-xs text-white/35">
                  {isReceiver ? `From ${displayPeerName}` : `To ${displayPeerName}`}
                </p>
              )}

              {isSender &&
                hasActiveSession &&
                transferSessionStatus === "connecting" &&
                transferState !== "failed" && (
                  <button
                    type="button"
                    className="mt-3 text-xs text-cyan-400/80 underline-offset-2 hover:underline"
                    onClick={() => void startOutgoingFileTransfer()}
                  >
                    Retry transfer start
                  </button>
                )}
            </div>

            <div className="mt-5 w-full">
              <OverallTransferProgress
                progress={progress}
                bytesTransferred={bytesTransferred}
                totalBytes={effectiveTotalSize}
                speed={speed}
                estimatedTimeRemaining={estimatedTimeRemaining}
              />
            </div>

            {showPerFileProgress && (
              <section className="mt-4 w-full">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-3">
                  <p className="mb-2.5 text-[10px] font-medium uppercase tracking-widest text-white/30">
                    File queue
                  </p>
                  <PerFileTransferProgressList
                    fileIds={perFileProgressOrder}
                    progressByFileId={perFileTransferProgress}
                  />
                </div>
              </section>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="complete"
            className="flex w-full max-w-sm flex-col items-center text-center"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <TransferCompleteHeader />

            <h1 className="text-xl font-semibold tracking-tight text-white">
              Transfer Complete
            </h1>
            <p className="mt-1 text-xs text-white/40">
              {summaryMode === "receiver"
                ? "Choose files to save to your device"
                : "All files were delivered successfully"}
            </p>

            {summaryMode === "receiver" && receivedFilesList.length > 0 && (
              <ReceivedFileSelectionList
                files={receivedFilesList}
                selectedByFileId={selectedCompletedFileIds}
                onToggle={toggleCompletedFileSelection}
              />
            )}

            {summaryMode === "receiver" &&
              receivedFilesList.length === 0 &&
              summaryFileNames.length > 0 && (
                <ul className="mt-6 max-h-48 w-full space-y-2 overflow-y-auto text-left">
                  {summaryFileNames.map((fileName, index) => {
                    const Icon = getFileIcon(fileName)
                    return (
                      <li
                        key={`${fileName}-${index}`}
                        className="glass-panel flex items-center gap-3 rounded-xl px-3.5 py-3"
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                          <Icon className="size-4" />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm text-white/85">
                          {fileName}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}

            <p className="mt-5 text-sm text-white/45">
              {summaryFileCount} file{summaryFileCount !== 1 ? "s" : ""}{" "}
              {summaryMode === "receiver" ? "received" : "sent"} successfully
            </p>

            {summaryPeerUsername && (
              <p className="mt-1 text-xs text-white/35">
                {summaryMode === "receiver"
                  ? `From ${summaryPeerUsername}`
                  : `To ${summaryPeerUsername}`}
              </p>
            )}

            <div className="mt-8 flex w-full max-w-xs flex-col items-center gap-3">
              {summaryMode === "receiver" ? (
                <>
                  <GlowButton
                    disabled={!canDownloadReceived || selectedDownloadCount === 0}
                    className={cn(
                      "w-full transition-opacity duration-300",
                      selectedDownloadCount === 0 && "opacity-50"
                    )}
                    onClick={handleDownloadSelected}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Download className="size-4" />
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={downloadButtonLabel}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18 }}
                        >
                          {downloadButtonLabel}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </GlowButton>
                  <button
                    type="button"
                    onClick={handleExit}
                    className={cn(
                      "text-sm font-medium text-white/45 transition-colors",
                      "hover:text-white/70"
                    )}
                  >
                    Exit
                  </button>
                </>
              ) : (
                <GlowButton onClick={handleDone} className="w-full">
                  Done
                </GlowButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
