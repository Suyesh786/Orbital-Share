import { useCallback } from "react"
import {
  selectCompleteOnboarding,
  selectDeviceId,
  selectInitialize,
  selectIsHydrated,
  selectNeedsOnboarding,
  selectOnboardingCompleted,
  selectRenameUsername,
  selectUsername,
  useTransferStore,
} from "@/store/useTransferStore"
import { isValidUsername, normalizeUsername } from "@/utils/device"

export function useDeviceIdentity() {
  const username = useTransferStore(selectUsername)
  const deviceId = useTransferStore(selectDeviceId)
  const onboardingCompleted = useTransferStore(selectOnboardingCompleted)
  const isHydrated = useTransferStore(selectIsHydrated)
  const needsOnboarding = useTransferStore(selectNeedsOnboarding)
  const completeOnboarding = useTransferStore(selectCompleteOnboarding)
  const renameUsername = useTransferStore(selectRenameUsername)
  const initialize = useTransferStore(selectInitialize)

  const submitUsername = useCallback(
    (value: string) => completeOnboarding(value),
    [completeOnboarding]
  )

  const submitRename = useCallback(
    (value: string) => renameUsername(value),
    [renameUsername]
  )

  return {
    username,
    deviceId,
    onboardingCompleted,
    isHydrated,
    needsOnboarding,
    initialize,
    submitUsername,
    submitRename,
    isValidUsername,
    normalizeUsername,
  }
}
