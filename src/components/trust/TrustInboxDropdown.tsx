import { AnimatePresence, motion } from "framer-motion"
import { TrustInboxMessageRow } from "@/components/trust/TrustInboxMessageRow"
import { useTrustInboxStore } from "@/store/useTrustInboxStore"

interface TrustInboxDropdownProps {
  open: boolean
  localUsername: string
}

export function TrustInboxDropdown({ open, localUsername }: TrustInboxDropdownProps) {
  const items = useTrustInboxStore((s) => s.items)
  const activeItemId = useTrustInboxStore((s) => s.activeItemId)
  const successFlashId = useTrustInboxStore((s) => s.successFlashId)
  const selectItem = useTrustInboxStore((s) => s.selectItem)
  const trustItem = useTrustInboxStore((s) => s.trustItem)
  const maybeLaterItem = useTrustInboxStore((s) => s.maybeLaterItem)
  const dismissItemForSession = useTrustInboxStore((s) => s.dismissItemForSession)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Trust notifications"
          className="absolute top-full right-0 z-50 mt-2 origin-top-right"
          initial={{ opacity: 0, scale: 0.92, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: -8 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <div className="trust-inbox-panel flex w-[300px] max-h-[min(360px,55vh)] flex-col overflow-hidden rounded-2xl border border-cyan-400/15 shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
            <div className="shrink-0 border-b border-white/[0.06] px-3.5 py-2.5">
              <p className="text-[12px] font-semibold text-white/90">Trust Inbox</p>
              <p className="text-[10px] text-white/40">
                Relationship suggestions & history
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2.5 py-2">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-white/40">
                  No trust notifications yet
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <TrustInboxMessageRow
                      key={item.id}
                      item={item}
                      localUsername={localUsername}
                      selected={activeItemId === item.id}
                      showSuccessFlash={successFlashId === item.id}
                      onSelect={() => selectItem(item.id)}
                      onTrust={() => trustItem(item.id)}
                      onMaybeLater={() => maybeLaterItem(item.id)}
                      onDismiss={() => dismissItemForSession(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
