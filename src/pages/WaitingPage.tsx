import { useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ReceiverDiscoveryPulse } from "@/components/receiver/ReceiverDiscoveryPulse"
import { BackButton } from "@/components/shared/BackButton"
import { ProfileAvatar } from "@/components/profile/ProfileAvatar"
import { IncomingTransferRequestModal } from "@/components/transfer/IncomingTransferRequestModal"
import { getDesktopApi } from "@/lib/electron"
import {
  selectActiveTransferId,
  selectCompletionSummary,
  selectConnectionStatus,
  selectDiscoverable,
  selectExitReceiverMode,
  selectHasIncomingTransferRequest,
  selectMode,
  selectUsername,
  useTransferStore,
} from "@/store/useTransferStore"

export function WaitingPage() {
  const navigate = useNavigate()
  const username = useTransferStore(selectUsername)
  const discoverable = useTransferStore(selectDiscoverable)
  const connectionStatus = useTransferStore(selectConnectionStatus)
  const mode = useTransferStore(selectMode)
  const activeTransferId = useTransferStore(selectActiveTransferId)
  const completionSummary = useTransferStore(selectCompletionSummary)
  const exitReceiverMode = useTransferStore(selectExitReceiverMode)
  const hasIncomingTransferRequest = useTransferStore(selectHasIncomingTransferRequest)

  const isSearching = connectionStatus === "searching"

  useEffect(() => {
    if (mode !== "receiver") return
    if (!activeTransferId && !completionSummary) return
    navigate("/transfer", { replace: true })
  }, [mode, activeTransferId, completionSummary, navigate])

  const handleBack = useCallback(() => {
    const desktopApi = getDesktopApi()
    if (desktopApi) {
      void desktopApi.setReceiverEnabled(false)
    } else {
      exitReceiverMode()
    }
    navigate("/")
  }, [exitReceiverMode, navigate])

  const handleCancel = useCallback(() => {
    const desktopApi = getDesktopApi()
    if (desktopApi) {
      void desktopApi.setReceiverEnabled(false)
    } else {
      exitReceiverMode()
    }
    navigate("/")
  }, [exitReceiverMode, navigate])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <IncomingTransferRequestModal />

      <motion.div
        className="relative z-[1] flex h-full min-h-0 flex-col"
        animate={
          hasIncomingTransferRequest
            ? { scale: 0.985, opacity: 0.36, filter: "blur(10px)" }
            : { scale: 1, opacity: 1, filter: "blur(0px)" }
        }
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden={hasIncomingTransferRequest}
      >
        <header className="absolute left-0 top-0 z-20 shrink-0 px-2 pt-1">
          <BackButton onBack={handleBack} />
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col items-center px-8 pt-[14%]">
          <ReceiverDiscoveryPulse muted={hasIncomingTransferRequest}>
            {username ? (
              <ProfileAvatar username={username} size="md" />
            ) : (
              <span className="airspace-receiver-core-dot size-3 rounded-full bg-[var(--airspace-accent)]" />
            )}
          </ReceiverDiscoveryPulse>

          <div className="mt-14 w-full max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-white/95">
              {isSearching ? "Searching for nearby senders…" : "Ready to receive"}
            </h1>

            {username && (
              <p className="mt-2.5 text-sm text-white/45">
                Visible as <span className="text-white/70">{username}</span>
              </p>
            )}

            <motion.p
              className="mt-3.5 text-xs tracking-[0.02em] text-white/32"
              animate={
                hasIncomingTransferRequest
                  ? { opacity: 0.28 }
                  : { opacity: [0.35, 0.72, 0.35] }
              }
              transition={
                hasIncomingTransferRequest
                  ? { duration: 0.2 }
                  : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
              }
            >
              {discoverable && mode === "receiver"
                ? "This device is discoverable on your local network"
                : "Waiting for connection"}
            </motion.p>

            <motion.button
              type="button"
              onClick={handleCancel}
              className="mt-10 rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/50 transition-colors duration-300 hover:border-white/20 hover:text-white/70"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Cancel
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
