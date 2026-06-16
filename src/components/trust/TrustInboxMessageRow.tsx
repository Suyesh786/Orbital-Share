import { Check, Clock, X } from "lucide-react"
import { motion } from "framer-motion"
import { formatTrustRelationship } from "@/lib/trustedDevices"
import type { TrustInboxRole } from "@/lib/trustInboxHistory"
import type { TrustInboxNotification } from "@/lib/trustInboxHistory"
import { cn } from "@/lib/utils"

interface TrustInboxMessageRowProps {
  item: TrustInboxNotification
  localUsername: string
  selected: boolean
  showSuccessFlash: boolean
  onSelect: () => void
  onTrust?: () => void
  onMaybeLater?: () => void
  onDismiss?: () => void
}

function titleFor(role: TrustInboxRole, username: string): string {
  return role === "sender" ? `Trust ${username}?` : `Trust ${username}?`
}

function bodyFor(role: TrustInboxRole, username: string): string {
  return role === "sender"
    ? `You and ${username} have transferred files multiple times.`
    : `You have received files from ${username} multiple times.`
}

export function TrustInboxMessageRow({
  item,
  localUsername,
  selected,
  showSuccessFlash,
  onSelect,
  onTrust,
  onMaybeLater,
  onDismiss,
}: TrustInboxMessageRowProps) {
  const relationship = formatTrustRelationship(
    localUsername,
    item.peerUsername
  )
  const isTrusted = item.status === "trusted"
  const isPending = item.status === "pending"
  const isSnoozed = item.status === "snoozed"
  const isDismissed = item.status === "dismissed"

  return (
    <motion.div
      layout
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors",
        !item.read && "border-amber-400/25 bg-amber-500/[0.04]",
        item.read && !isTrusted && "border-white/[0.06] bg-white/[0.02]",
        isTrusted &&
          "border-emerald-400/25 bg-emerald-500/[0.06] shadow-[0_0_20px_rgba(52,211,153,0.08)]",
        selected && isPending && "border-cyan-400/30 bg-cyan-500/[0.06]"
      )}
      initial={false}
      animate={
        showSuccessFlash
          ? { boxShadow: ["0 0 0 rgba(52,211,153,0)", "0 0 24px rgba(52,211,153,0.25)", "0 0 0 rgba(52,211,153,0)"] }
          : {}
      }
      transition={{ duration: 0.7 }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          {!item.read && (
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          )}
          {isTrusted && (
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <Check className="size-3" strokeWidth={2.5} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[12px] font-semibold",
                isTrusted ? "text-emerald-200/90" : "text-white/90"
              )}
            >
              {isTrusted ? "Trusted device" : titleFor(item.role, item.peerUsername)}
            </p>
            <p className="mt-0.5 text-[10px] text-white/45">
              {isTrusted
                ? relationship
                : bodyFor(item.role, item.peerUsername)}
            </p>
            <p className="mt-1 text-[9px] font-medium tracking-wide text-cyan-400/50">
              {relationship}
            </p>
            {isSnoozed && (
              <p className="mt-1 flex items-center gap-1 text-[9px] text-white/35">
                <Clock className="size-2.5" />
                Remind after more transfers
              </p>
            )}
            {isDismissed && (
              <p className="mt-1 text-[9px] text-white/35">Dismissed this session</p>
            )}
          </div>
        </div>
      </button>

      {isPending && selected && (
        <motion.div
          className="mt-2.5 flex gap-2"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <button
            type="button"
            onClick={onTrust}
            className="flex-1 rounded-lg bg-cyan-500/20 px-2 py-1.5 text-[10px] font-medium text-cyan-200 hover:bg-cyan-500/30"
          >
            Trust Device
          </button>
          <button
            type="button"
            onClick={onMaybeLater}
            className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-white/55 hover:border-white/18"
          >
            Maybe Later
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex size-7 items-center justify-center rounded-lg border border-white/10 text-white/45 hover:text-white/70"
            aria-label="Dismiss for session"
          >
            <X className="size-3" />
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}
