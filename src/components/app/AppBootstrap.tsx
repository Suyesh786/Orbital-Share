import { useEffect, type ReactNode } from "react"
import { UsernameModal } from "@/components/common/UsernameModal"
import { getDesktopApi } from "@/lib/electron"
import {
  selectIsHydrated,
  useTransferStore,
} from "@/store/useTransferStore"

interface AppBootstrapProps {
  children: ReactNode
}

export function AppBootstrap({ children }: AppBootstrapProps) {
  const isHydrated = useTransferStore(selectIsHydrated)

  useEffect(() => {
    const store = useTransferStore.getState()
    store.initialize()
    store.connectWebSocket()

    return () => {
      useTransferStore.getState().disconnectWebSocket()
    }
  }, [])

  useEffect(() => {
    const desktopApi = getDesktopApi()
    if (!desktopApi) return

    let active = true

    void desktopApi.getReceiverEnabled().then((enabled) => {
      if (!active) return
      useTransferStore.getState().syncReceiverEnabledFromDesktop(enabled)
      if (enabled && window.location.hash !== "#/transfer") {
        window.location.hash = "/waiting"
      }
    })

    void desktopApi.getLanReceivers().then((receivers) => {
      if (!active) return
      useTransferStore.getState().applyLanReceiverServices(receivers)
    })

    void desktopApi.getLanDiscoveryError().then((error) => {
      if (!active || !error) return
      useTransferStore.setState({ transferNoticeMessage: error.message })
    })

    const unsubscribeReceiverEnabled = desktopApi.onReceiverEnabledChanged(
      (enabled) => {
        useTransferStore.getState().syncReceiverEnabledFromDesktop(enabled)

        const state = useTransferStore.getState()
        if (enabled && !state.activeTransferId && window.location.hash !== "#/transfer") {
          window.location.hash = "/waiting"
          return
        }

        if (
          !enabled &&
          !state.activeTransferId &&
          (window.location.hash === "#/waiting" || window.location.hash === "#/")
        ) {
          window.location.hash = "/"
        }
      }
    )

    const unsubscribe = desktopApi.onLanReceivers((receivers) => {
      useTransferStore.getState().applyLanReceiverServices(receivers)
    })

    const unsubscribeLanError = desktopApi.onLanDiscoveryError((error) => {
      useTransferStore.setState({ transferNoticeMessage: error.message })
    })

    const unsubscribeNavigate = desktopApi.onNavigateRequest((targetPath) => {
      if (typeof targetPath !== "string" || !targetPath) return
      window.location.hash = targetPath
    })

    const unsubscribeIncomingAction =
      desktopApi.onIncomingTransferNotificationAction((payload) => {
        const store = useTransferStore.getState()
        const request = store.incomingTransferRequest
        if (
          payload.requesterSocketId &&
          request?.requesterSocketId !== payload.requesterSocketId
        ) {
          return
        }

        if (payload.action === "accept") {
          store.acceptIncomingTransferRequest()
          return
        }

        store.rejectIncomingTransferRequest()
      })

    const unsubscribeRuntimeResume = desktopApi.onRuntimeResume((payload) => {
      const store = useTransferStore.getState()
      if (payload.receiverEnabled) {
        store.syncReceiverEnabledFromDesktop(true)
        return
      }

      if (store.mode === "sender" && store.transferState === "discovering") {
        store.startDiscovery()
      }
    })

    return () => {
      active = false
      unsubscribeReceiverEnabled()
      unsubscribe()
      unsubscribeLanError()
      unsubscribeNavigate()
      unsubscribeIncomingAction()
      unsubscribeRuntimeResume()
    }
  }, [])

  return (
    <>
      {children}
      {isHydrated && <UsernameModal />}
    </>
  )
}
