import { motion } from "framer-motion"
import { Shield, Wifi } from "lucide-react"

export function StatusSection() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <motion.span
          className="relative flex size-2"
          aria-hidden
        >
          <motion.span
            className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-75"
            animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        </motion.span>
        <span className="text-sm font-medium text-emerald-400/90">
          Local Network Ready
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-white/40">
        <Shield className="size-3.5" />
        <span>Secure Transfer Available</span>
        <Wifi className="ml-1 size-3.5 opacity-60" />
      </div>
    </div>
  )
}
