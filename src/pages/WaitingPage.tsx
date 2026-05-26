import { useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ReceiverDiscoveryPulse } from "@/components/receiver/ReceiverDiscoveryPulse"
import { BackButton } from "@/components/shared/BackButton"
import { ProfileAvatar } from "@/components/profile/ProfileAvatar"
import { IncomingTransferRequestModal } from "@/components/transfer/IncomingTransferRequestModal"
import {
  selectActiveTransferId,
  selectCompletionSummary,
  selectConnectionStatus,
  selectDiscoverable,
  selectExitReceiverMode,
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

  const isSearching = connectionStatus === "searching"

  useEffect(() => {
    if (mode !== "receiver") return
    if (!activeTransferId && !completionSummary) return
    navigate("/transfer", { replace: true })
  }, [mode, activeTransferId, completionSummary, navigate])

  const handleBack = useCallback(() => {
    exitReceiverMode()
    navigate("/")
  }, [exitReceiverMode, navigate])

  const handleCancel = useCallback(() => {
    exitReceiverMode()
    navigate("/")
  }, [exitReceiverMode, navigate])

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <IncomingTransferRequestModal />

      <header className="absolute left-0 top-0 z-20 shrink-0 px-2 pt-1">
        <BackButton onBack={handleBack} />
      </header>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center px-8 pt-[14%]">
        <ReceiverDiscoveryPulse>
          {username ? (
            <ProfileAvatar username={username} size="md" />
          ) : (
            <span className="neardrop-receiver-core-dot size-3 rounded-full bg-[var(--neardrop-accent)]" />
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
            animate={{ opacity: [0.35, 0.72, 0.35] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
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
    </div>
  )
}
