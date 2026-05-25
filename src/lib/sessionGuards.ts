import { useTransferStore } from "@/store/useTransferStore"

export function canAccessSelect(): boolean {
  const { mode, selectedFiles } = useTransferStore.getState()
  if (mode === "sender") return true
  return selectedFiles.some((f) => f.selected)
}

export function canAccessDiscovery(): boolean {
  const { mode, selectedFiles } = useTransferStore.getState()
  return mode === "sender" && selectedFiles.some((f) => f.selected)
}

export function canAccessTransfer(): boolean {
  const {
    mode,
    selectedReceiver,
    activeTransferPeer,
    activeTransferId,
    transferSessionStatus,
    completionSummary,
    transferState,
  } = useTransferStore.getState()

  if (completionSummary !== null || transferState === "completed") {
    return true
  }

  if (!activeTransferId || !transferSessionStatus) return false

  const sessionActive =
    transferSessionStatus === "connecting" ||
    transferSessionStatus === "metadata" ||
    transferSessionStatus === "transferring" ||
    transferSessionStatus === "reconstructing" ||
    transferSessionStatus === "completed"

  if (!sessionActive) return false

  if (mode === "sender") return selectedReceiver !== null && activeTransferPeer !== null
  if (mode === "receiver") return activeTransferPeer !== null
  return false
}

export function canAccessWaiting(): boolean {
  const { mode, discoverable } = useTransferStore.getState()
  return mode === "receiver" && discoverable
}

export function restoreSelectSession(): void {
  const store = useTransferStore.getState()
  if (store.mode !== "sender" && store.selectedFiles.some((f) => f.selected)) {
    store.setMode("sender")
  }
}

export function restoreDiscoverySession(): void {
  const store = useTransferStore.getState()
  if (!canAccessDiscovery()) return

  if (store.transferState !== "discovering") {
    store.setTransferState("discovering")
    store.setConnectionStatus("searching")
  }

  store.discoverReceivers()
}

export function restoreWaitingSession(): void {
  const store = useTransferStore.getState()
  if (store.mode === "receiver" && store.discoverable) {
    if (!store.activeTransferId && store.transferState !== "waiting") {
      store.setTransferState("waiting")
      store.setConnectionStatus("searching")
    }
    if (!store.activeTransferId && store.completionSummary) {
      store.clearCompletionSummary()
    }
    store.registerDevice()
    return
  }
  if (store.mode !== "receiver") return
  store.setDiscoverable(true)
  store.setConnectionStatus("searching")
  store.setTransferState("waiting")
  store.registerDevice()
}
