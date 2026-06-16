import { useEffect, useRef } from "react"
import { TrustInboxDropdown } from "@/components/trust/TrustInboxDropdown"
import { TrustInboxIcon } from "@/components/trust/TrustInboxIcon"
import {
  selectTrustInboxHasUnread,
  selectTrustInboxUnreadCount,
  useTrustInboxStore,
} from "@/store/useTrustInboxStore"
import { selectUsername, useTransferStore } from "@/store/useTransferStore"

export function TrustInboxLayer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const localUsername = useTransferStore(selectUsername) || "You"
  const hydrate = useTrustInboxStore((s) => s.hydrate)
  const unreadCount = useTrustInboxStore(selectTrustInboxUnreadCount)
  const hasUnread = useTrustInboxStore(selectTrustInboxHasUnread)
  const isOpen = useTrustInboxStore((s) => s.isOpen)
  const iconPulse = useTrustInboxStore((s) => s.iconPulse)
  const toggleInbox = useTrustInboxStore((s) => s.toggleInbox)
  const closeInbox = useTrustInboxStore((s) => s.closeInbox)
  const consumeIconPulse = useTrustInboxStore((s) => s.consumeIconPulse)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!iconPulse) return
    const timer = window.setTimeout(consumeIconPulse, 1800)
    return () => window.clearTimeout(timer)
  }, [iconPulse, consumeIconPulse])

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeInbox()
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [isOpen, closeInbox])

  return (
    <div ref={containerRef} className="relative">
      <TrustInboxIcon
        unreadCount={unreadCount}
        hasUnread={hasUnread}
        pulse={iconPulse}
        open={isOpen}
        onClick={toggleInbox}
      />
      <TrustInboxDropdown open={isOpen} localUsername={localUsername} />
    </div>
  )
}
