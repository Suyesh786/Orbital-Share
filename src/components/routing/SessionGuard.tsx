import { useEffect, useRef, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { selectIsHydrated, useTransferStore } from "@/store/useTransferStore"

interface SessionGuardProps {
  allow: () => boolean
  redirectTo?: string
  onAllowed?: () => void
  children: ReactNode
}

export function SessionGuard({
  allow,
  redirectTo = "/",
  onAllowed,
  children,
}: SessionGuardProps) {
  const navigate = useNavigate()
  const isHydrated = useTransferStore(selectIsHydrated)
  const checkedRef = useRef(false)

  useEffect(() => {
    if (!isHydrated || checkedRef.current) return
    checkedRef.current = true

    if (!allow()) {
      navigate(redirectTo, { replace: true })
      return
    }

    onAllowed?.()
  }, [isHydrated, allow, redirectTo, navigate, onAllowed])

  if (!isHydrated) return null
  if (!allow()) return null

  return children
}
