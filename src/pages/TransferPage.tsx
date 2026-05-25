import { useCallback, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Download, File } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { BackButton } from "@/components/shared/BackButton"
import { GlowButton } from "@/components/shared/GlowButton"
import { getActiveSelectedFiles } from "@/store/transferUtils"
import {
  selectActiveFileCount,
  selectActiveTransferPeerUsername,
  selectActiveTransferTotalBytes,
  selectBytesTransferred,
  selectCompletionSummary,
  selectEstimatedTimeRemaining,
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
import { formatDuration, formatFileSize, formatSpeed } from "@/lib/format"
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

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="absolute left-6 top-0">
        {!complete && isSender && <BackButton onBack={handleBack} />}
      </div>

      <AnimatePresence mode="wait">
        {!complete ? (
          <motion.div
            key="transferring"
            className="flex w-full max-w-sm flex-col items-center"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="mb-6 flex size-14 items-center justify-center rounded-2xl glass-panel">
              <File className="size-6 text-cyan-400" />
            </div>

            <h1 className="text-lg font-semibold text-white">{statusLabel}</h1>
            <p className="mt-1 max-w-[240px] truncate text-sm text-white/45">
              {isReceiver
                ? `${effectiveFileCount} incoming file${effectiveFileCount !== 1 ? "s" : ""}`
                : (currentFile?.name ?? "Files")}
            </p>
            {displayPeerName && (
              <p className="mt-0.5 text-xs text-white/35">
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

            <div className="mt-8 w-full">
              <div className="mb-2 flex justify-between text-xs text-white/40">
                <span>{Math.round(progress)}%</span>
                <span>
                  {formatFileSize(bytesTransferred)} /{" "}
                  {formatFileSize(effectiveTotalSize)}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/5">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400"
                  style={{ width: `${progress}%` }}
                  transition={{ ease: "easeOut" }}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-cyan-300/30 blur-sm"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-6 grid w-full grid-cols-2 gap-4 text-center">
              <div className="glass-panel rounded-xl py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/35">
                  Speed
                </p>
                <p className="mt-0.5 text-sm font-medium text-cyan-300/90">
                  {formatSpeed(speed)}
                </p>
              </div>
              <div className="glass-panel rounded-xl py-3">
                <p className="text-[10px] uppercase tracking-wider text-white/35">
                  Remaining
                </p>
                <p className="mt-0.5 text-sm font-medium text-white/80">
                  {progress >= 100 ? "—" : formatDuration(estimatedTimeRemaining)}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="complete"
            className="flex w-full max-w-sm flex-col items-center text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            <motion.div
              className="mb-6 flex size-20 items-center justify-center rounded-full bg-emerald-500/15 shadow-[0_0_40px_rgba(52,211,153,0.25)]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 18,
                delay: 0.1,
              }}
            >
              <Check className="size-10 text-emerald-400" strokeWidth={2} />
            </motion.div>

            <h1 className="text-xl font-semibold text-white">Transfer Complete</h1>

            {summaryMode === "receiver" && summaryFileNames.length > 0 && (
              <ul className="mt-5 max-h-48 w-full space-y-2 overflow-y-auto pr-1 text-left">
                {summaryFileNames.map((fileName, index) => (
                  <li
                    key={`${fileName}-${index}`}
                    className="glass-panel flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/80"
                  >
                    <span className="text-emerald-400" aria-hidden>
                      ✅
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {fileName} received
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-sm text-white/45">
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
                    disabled
                    className="w-full opacity-90"
                    onClick={() => undefined}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Download className="size-4" />
                      Download All Files
                    </span>
                  </GlowButton>
                  <p className="text-[11px] text-white/35">
                    Available in Phase 3.2
                  </p>
                  <button
                    type="button"
                    onClick={handleExit}
                    className={cn(
                      "text-sm font-medium text-red-400/90 transition-colors",
                      "hover:text-red-300"
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
