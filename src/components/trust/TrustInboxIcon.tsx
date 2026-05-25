import { Inbox } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface TrustInboxIconProps {
  unreadCount: number
  hasUnread: boolean
  pulse: boolean
  open: boolean
  onClick: () => void
}

export function TrustInboxIcon({
  unreadCount,
  hasUnread,
  pulse,
  open,
  onClick,
}: TrustInboxIconProps) {
  return (
    <motion.button
      type="button"
      aria-label={
        hasUnread
          ? `Trust inbox, ${unreadCount} unread`
          : "Trust inbox"
      }
      onClick={onClick}
      className={cn(
        "relative flex size-9 items-center justify-center rounded-xl",
        "glass-panel border border-white/[0.08]",
        "text-cyan-300/80 transition-colors",
        "hover:border-cyan-400/30 hover:text-cyan-200",
        open && "border-cyan-400/35 shadow-[0_0_20px_rgba(61,217,245,0.2)]"
      )}
      animate={
        pulse
          ? {
              scale: [1, 1.06, 1],
            }
          : { scale: 1 }
      }
      transition={
        pulse
          ? { duration: 0.55, repeat: 2, ease: "easeInOut" }
          : { type: "spring", stiffness: 400, damping: 28 }
      }
      whileTap={{ scale: 0.94 }}
    >
      <Inbox className="size-4" strokeWidth={2} />
      {hasUnread && (
        <>
          <motion.span
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,146,60,0.75)]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            aria-hidden
          />
          {unreadCount > 0 && (
            <motion.span
              className="absolute -top-1.5 -right-1.5 flex min-w-[14px] items-center justify-center rounded-full bg-amber-500/95 px-0.5 text-[8px] font-bold text-[#1a0f00]"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </>
      )}
    </motion.button>
  )
}
