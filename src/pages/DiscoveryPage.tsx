import { useCallback, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { DiscoveryDeviceList } from "@/components/discovery/DiscoveryDeviceList"
import { OrbitalRadar } from "@/components/discovery/OrbitalRadar"
import { BackButton } from "@/components/shared/BackButton"
import {
  selectActiveTransferId,
  selectCompletionSummary,
  selectCancelOutgoingTransferRequest,
  selectMode,
  selectNearbyDeviceCount,
  selectResetDiscovery,
  selectSelectedReceiver,
  selectStartDiscovery,
  selectTransferRejectionMessage,
  selectTransferState,
  useTransferStore,
} from "@/store/useTransferStore"

export function DiscoveryPage() {
  const navigate = useNavigate()
  const mode = useTransferStore(selectMode)
  const transferState = useTransferStore(selectTransferState)
  const selectedReceiver = useTransferStore(selectSelectedReceiver)
  const nearbyDeviceCount = useTransferStore(selectNearbyDeviceCount)
  const rejectionMessage = useTransferStore(selectTransferRejectionMessage)
  const startDiscovery = useTransferStore(selectStartDiscovery)
  const resetDiscovery = useTransferStore(selectResetDiscovery)
  const cancelOutgoingRequest = useTransferStore(selectCancelOutgoingTransferRequest)
  const activeTransferId = useTransferStore(selectActiveTransferId)
  const completionSummary = useTransferStore(selectCompletionSummary)
  const discoveryStartedRef = useRef(false)

  const isRequesting = transferState === "requesting"

  useEffect(() => {
    if (mode !== "sender") return
    if (discoveryStartedRef.current) return
    if (
      transferState === "discovering" ||
      transferState === "requesting" ||
      transferState === "connecting"
    ) {
      discoveryStartedRef.current = true
      return
    }

    discoveryStartedRef.current = true
    startDiscovery()
  }, [mode, transferState, startDiscovery])

  useEffect(() => {
    if (mode !== "sender") return
    if (!activeTransferId && !completionSummary) return
    navigate("/transfer", { replace: true })
  }, [mode, activeTransferId, completionSummary, navigate])

  const handleBack = useCallback(() => {
    if (isRequesting) {
      cancelOutgoingRequest()
    }
    discoveryStartedRef.current = false
    resetDiscovery()
    navigate("/select")
  }, [navigate, resetDiscovery, isRequesting, cancelOutgoingRequest])

  const handleCancelRequest = useCallback(() => {
    cancelOutgoingRequest()
  }, [cancelOutgoingRequest])

  const showEmptyState =
    nearbyDeviceCount === 0 &&
    transferState === "discovering" &&
    !selectedReceiver &&
    !rejectionMessage

  return (
    <div className="flex h-full flex-col">
      <BackButton onBack={handleBack} />

      <header className="mt-1 text-center">
        <h1 className="text-lg font-semibold text-white">
          {isRequesting ? "Waiting for Receiver" : "Discovering Nearby Devices"}
        </h1>
        <motion.p
          className="mt-1 text-sm text-white/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {isRequesting
            ? "The receiver must accept your request"
            : "Select a device to send your files"}
        </motion.p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {showEmptyState ? (
          <motion.div
            className="flex flex-1 flex-col items-center justify-center px-8 text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="glass-panel glow-cyan mb-5 flex size-16 items-center justify-center rounded-2xl">
              <span className="text-2xl text-cyan-400/80">◎</span>
            </div>
            <p className="text-base font-medium text-white/80">
              No nearby receivers found
            </p>
            <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-white/40">
              Ask another device to open Receive Files
            </p>
          </motion.div>
        ) : (
          <>
            <OrbitalRadar />
            <DiscoveryDeviceList />
          </>
        )}
      </div>

      {rejectionMessage && (
        <motion.p
          className="shrink-0 px-4 pb-1 text-center text-xs text-amber-300/90"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {rejectionMessage}
        </motion.p>
      )}

      {isRequesting && selectedReceiver && (
        <motion.div
          className="shrink-0 flex flex-col items-center gap-2 pb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-center text-xs text-cyan-400/80">
            Waiting for {selectedReceiver.username}…
          </p>
          <motion.button
            type="button"
            onClick={handleCancelRequest}
            className="rounded-full border border-white/10 px-4 py-1.5 text-[11px] text-white/45 transition-colors hover:border-white/20 hover:text-white/65"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Cancel request
          </motion.button>
        </motion.div>
      )}
    </div>
  )
}
