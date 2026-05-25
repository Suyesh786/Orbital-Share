import { useEffect, type ReactNode } from "react"
import { UsernameModal } from "@/components/common/UsernameModal"
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

  return (
    <>
      {children}
      {isHydrated && <UsernameModal />}
    </>
  )
}
