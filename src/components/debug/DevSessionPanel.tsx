import { useLocation } from "react-router-dom"
import {
  selectActiveFileCount,
  selectConnectionStatus,
  selectWsConnectionStatus,
  selectWsSocketId,
  selectRegisteredMode,
  selectActiveTransferId,
  selectHasIncomingTransferRequest,
  selectLastWsEvent,
  selectTransferSessionStatus,
  selectMode,
  selectNearbyDeviceCount,
  selectSelectedReceiverUsername,
  selectTransferState,
  useTransferStore,
} from "@/store/useTransferStore"

/** Never rendered in production builds. */
export function DevSessionPanel() {
  if (!import.meta.env.DEV) return null

  const location = useLocation()
  const mode = useTransferStore(selectMode)
  const transferState = useTransferStore(selectTransferState)
  const connectionStatus = useTransferStore(selectConnectionStatus)
  const wsConnectionStatus = useTransferStore(selectWsConnectionStatus)
  const wsSocketId = useTransferStore(selectWsSocketId)
  const registeredMode = useTransferStore(selectRegisteredMode)
  const lastWsEvent = useTransferStore(selectLastWsEvent)
  const fileCount = useTransferStore(selectActiveFileCount)
  const deviceCount = useTransferStore(selectNearbyDeviceCount)
  const receiverName = useTransferStore(selectSelectedReceiverUsername)
  const hasIncoming = useTransferStore(selectHasIncomingTransferRequest)
  const activeTransferId = useTransferStore(selectActiveTransferId)
  const transferSessionStatus = useTransferStore(selectTransferSessionStatus)

  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-40 max-w-[200px] rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 font-mono text-[9px] leading-relaxed text-white/50 backdrop-blur-md"
      aria-hidden
    >
      <p className="text-white/30">session</p>
      <p>route: {location.pathname}</p>
      <p>mode: {mode}</p>
      <p>transfer: {transferState}</p>
      <p>conn: {connectionStatus}</p>
      <p>ws: {wsConnectionStatus}</p>
      <p>socket: {wsSocketId ? `${wsSocketId.slice(0, 8)}…` : "—"}</p>
      <p>reg: {registeredMode}</p>
      <p>event: {lastWsEvent}</p>
      <p>files: {fileCount}</p>
      <p>devices: {deviceCount}</p>
      <p>receiver: {receiverName || "—"}</p>
      <p>incoming: {hasIncoming ? "yes" : "no"}</p>
      <p>transferId: {activeTransferId ? `${activeTransferId.slice(0, 8)}…` : "—"}</p>
      <p>transferStatus: {transferSessionStatus || "—"}</p>
    </div>
  )
}
