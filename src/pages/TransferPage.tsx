import { useCallback, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Check, File } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { BackButton } from "@/components/shared/BackButton"
import { GlowButton } from "@/components/shared/GlowButton"
import { getActiveSelectedFiles } from "@/store/transferUtils"
import {
  selectActiveFileCount,
  selectActiveTransferPeerUsername,
  selectBeginMockTransfer,
  selectCompleteTransferAndExit,
  selectEstimatedTimeRemaining,
  selectExitTransferToDiscovery,
  selectHasActiveTransferSession,
  selectShowTransferComplete,
  selectIncomingFileCount,
  selectIncomingFilesTotalSize,
  selectMode,
  selectSelectedFiles,
  selectSelectedReceiverUsername,
  selectTickMockTransfer,
  selectTotalTransferSize,
  selectTransferProgress,
  selectTransferSessionStatus,
  selectTransferSpeed,
  selectTransferState,
  useTransferStore,
} from "@/store/useTransferStore"
import { formatDuration, formatFileSize, formatSpeed } from "@/lib/format"

export function TransferPage() {
  const navigate = useNavigate()
  const selectedFiles = useTransferStore(selectSelectedFiles)
  const activeFileCount = useTransferStore(selectActiveFileCount)
  const activeFiles = useMemo(
    () => getActiveSelectedFiles(selectedFiles),
    [selectedFiles]
  )
  const mode = useTransferStore(selectMode)
  const receiverUsername = useTransferStore(selectSelectedReceiverUsername)
  const peerUsername = useTransferStore(selectActiveTransferPeerUsername)
  const incomingFileCount = useTransferStore(selectIncomingFileCount)
  const incomingFilesTotalSize = useTransferStore(selectIncomingFilesTotalSize)
  const totalTransferSize = useTransferStore(selectTotalTransferSize)
  const hasActiveSession = useTransferStore(selectHasActiveTransferSession)
  const showTransferComplete = useTransferStore(selectShowTransferComplete)
  const transferSessionStatus = useTransferStore(selectTransferSessionStatus)
  const completeTransferAndExit = useTransferStore(selectCompleteTransferAndExit)
  const transferState = useTransferStore(selectTransferState)
  const progress = useTransferStore(selectTransferProgress)
  const speed = useTransferStore(selectTransferSpeed)
  const estimatedTimeRemaining = useTransferStore(
    selectEstimatedTimeRemaining
  )
  const beginMockTransfer = useTransferStore(selectBeginMockTransfer)
  const tickMockTransfer = useTransferStore(selectTickMockTransfer)
  const exitTransferToDiscovery = useTransferStore(selectExitTransferToDiscovery)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transferStartedRef = useRef(false)

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

  const complete = transferState === "completed"
  const sessionReady =
    transferSessionStatus === "connecting" ||
    transferSessionStatus === "transferring" ||
    transferSessionStatus === "completed"
  const isReceiver = mode === "receiver"
  const displayPeerName = isReceiver
    ? peerUsername
    : receiverUsername || peerUsername
  const effectiveFileCount = isReceiver ? incomingFileCount : activeFileCount
  const effectiveTotalSize = isReceiver
    ? incomingFilesTotalSize
    : totalTransferSize
  const currentFile = activeFiles[0]?.file
  const transferred = Math.floor((progress / 100) * effectiveTotalSize)

  const clearTransferInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!hasActiveSession || !sessionReady) return
    if (transferState === "completed" || transferState === "transferring") {
      return
    }
    if (transferSessionStatus !== "connecting") {
      return
    }
    if (transferStartedRef.current) return

    transferStartedRef.current = true
    beginMockTransfer()
  }, [
    hasActiveSession,
    sessionReady,
    transferState,
    transferSessionStatus,
    beginMockTransfer,
  ])

  useEffect(() => {
    if (transferState !== "transferring") {
      clearTransferInterval()
      return
    }

    clearTransferInterval()
    intervalRef.current = setInterval(() => {
      tickMockTransfer()
    }, 80)

    return clearTransferInterval
  }, [transferState, tickMockTransfer, clearTransferInterval])

  useEffect(() => {
    return () => {
      clearTransferInterval()
      transferStartedRef.current = false
    }
  }, [clearTransferInterval])

  useEffect(() => {
    if (!complete) return

    const timeout = setTimeout(() => {
      completeTransferAndExit()
      navigate(mode === "sender" ? "/discovery" : "/waiting", { replace: true })
    }, 5000)

    return () => clearTimeout(timeout)
  }, [complete, mode, navigate, completeTransferAndExit])

  const handleBack = useCallback(() => {
    clearTransferInterval()
    transferStartedRef.current = false
    exitTransferToDiscovery()
    navigate("/discovery")
  }, [clearTransferInterval, exitTransferToDiscovery, navigate])

  const handleDone = () => {
    clearTransferInterval()
    transferStartedRef.current = false
    completeTransferAndExit()
    navigate(mode === "sender" ? "/discovery" : "/waiting", { replace: true })
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="absolute left-6 top-0">
        <BackButton onBack={handleBack} />
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

            <h1 className="text-lg font-semibold text-white">Transferring</h1>
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

            <div className="mt-8 w-full">
              <div className="mb-2 flex justify-between text-xs text-white/40">
                <span>{Math.round(progress)}%</span>
                <span>
                  {formatFileSize(transferred)} / {formatFileSize(effectiveTotalSize)}
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
            className="flex flex-col items-center text-center"
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
            <p className="mt-2 text-sm text-white/45">
              {effectiveFileCount} file{effectiveFileCount !== 1 ? "s" : ""}{" "}
              {isReceiver ? "received" : "sent"} successfully
            </p>

            <div className="mt-8 w-full max-w-xs">
              <GlowButton onClick={handleDone}>Done</GlowButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
