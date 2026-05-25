import { useCallback } from "react"
import {
  enqueueTrustSuggestion,
  type TrustInboxRole,
} from "@/store/useTrustInboxStore"
import { useTransferStore } from "@/store/useTransferStore"

/**
 * Enqueues a persistent trust suggestion in the global inbox.
 */
export function useTrustSuggestions(role: TrustInboxRole) {
  const localUsername = useTransferStore((s) => s.username)

  const tryShowSuggestion = useCallback(
    (deviceId: string, username: string) => {
      enqueueTrustSuggestion(deviceId, username, role)
    },
    [role, localUsername]
  )

  return {
    role,
    tryShowSuggestion,
    clearSuggestion: () => {},
  }
}
