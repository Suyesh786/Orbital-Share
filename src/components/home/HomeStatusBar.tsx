import { motion } from "framer-motion"
import { Lock, Wifi } from "lucide-react"

interface HomeStatusBarProps {
  introDelay?: number
}

export function HomeStatusBar({ introDelay = 0.72 }: HomeStatusBarProps) {
  return (
    <motion.footer
      className="flex w-full shrink-0 items-end justify-between px-1 pb-0.5 pt-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: introDelay }}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex size-1.5 items-center justify-center" aria-hidden>
          <span className="passage-status-dot absolute inline-flex size-1.5 rounded-full bg-[var(--airspace-accent)]" />
        </span>
        <span className="text-[11px] font-medium tracking-[0.01em] text-white/38">
          Local network ready
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-white/28">
        <Lock className="size-3 text-white/22" strokeWidth={1.5} aria-hidden />
        <span>Encrypted</span>
        <Wifi
          className="size-3 text-[var(--airspace-accent)]/45"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
    </motion.footer>
  )
}
