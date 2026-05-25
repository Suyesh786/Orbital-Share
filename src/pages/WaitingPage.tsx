import { useCallback, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { BackButton } from "@/components/shared/BackButton"
import { ProfileAvatar } from "@/components/profile/ProfileAvatar"
import { IncomingTransferRequestModal } from "@/components/transfer/IncomingTransferRequestModal"
import {
  selectConnectionStatus,
  selectDiscoverable,
  selectExitReceiverMode,
  selectMode,
  selectTransferState,
  selectUsername,
  useTransferStore,
} from "@/store/useTransferStore"

export function WaitingPage() {
  const navigate = useNavigate()
  const username = useTransferStore(selectUsername)
  const discoverable = useTransferStore(selectDiscoverable)
  const connectionStatus = useTransferStore(selectConnectionStatus)
  const mode = useTransferStore(selectMode)
  const transferState = useTransferStore(selectTransferState)
  const exitReceiverMode = useTransferStore(selectExitReceiverMode)
  const navigateToTransferRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSearching = connectionStatus === "searching"

  useEffect(() => {
    if (transferState !== "connecting") return

    navigateToTransferRef.current = setTimeout(() => {
      navigate("/transfer")
    }, 600)

    return () => {
      if (navigateToTransferRef.current) {
        clearTimeout(navigateToTransferRef.current)
        navigateToTransferRef.current = null
      }
    }
  }, [transferState, navigate])

  const handleBack = useCallback(() => {
    exitReceiverMode()
    navigate("/")
  }, [exitReceiverMode, navigate])

  const handleCancel = useCallback(() => {
    exitReceiverMode()
    navigate("/")
  }, [exitReceiverMode, navigate])

  return (
    <div className="relative flex h-full flex-col items-center justify-center">
      <IncomingTransferRequestModal />
      <BackButton onBack={handleBack} />

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="relative mb-8 flex size-24 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border border-cyan-400/30"
              animate={{ scale: [0.6, 1.4], opacity: [0.6, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.6,
                ease: "easeOut",
              }}
            />
          ))}
          <motion.div
            className="relative flex size-16 items-center justify-center rounded-full glass-panel glow-cyan"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {username ? (
              <ProfileAvatar username={username} size="md" />
            ) : (
              <motion.div
                className="size-3 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(61,217,245,0.8)]"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
          </motion.div>
        </div>

        <h1 className="text-xl font-semibold text-white">
          {isSearching ? "Searching for nearby senders…" : "Ready to receive"}
        </h1>

        {username && (
          <p className="mt-2 text-sm text-white/45">
            Visible as <span className="text-white/70">{username}</span>
          </p>
        )}

        <motion.p
          className="mt-3 text-xs text-white/30"
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          {discoverable && mode === "receiver"
            ? "This device is discoverable on your local network"
            : "Waiting for connection"}
        </motion.p>

        <motion.button
          type="button"
          onClick={handleCancel}
          className="mt-10 rounded-full border border-white/10 px-6 py-2.5 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white/70"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Cancel
        </motion.button>
      </div>
    </div>
  )
}
