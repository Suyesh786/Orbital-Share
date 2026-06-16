import { motion } from "framer-motion"
import { Check } from "lucide-react"

export function TransferCompleteHeader() {
  return (
    <div className="relative mb-6 flex flex-col items-center">
      <motion.div
        className="absolute size-24 rounded-full bg-emerald-400/10 blur-2xl"
        animate={{ opacity: [0.35, 0.55, 0.35], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="relative flex size-20 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 shadow-[0_0_36px_rgba(52,211,153,0.28)]"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.12, duration: 0.25, ease: "easeOut" }}
        >
          <Check className="size-9 text-emerald-400" strokeWidth={2} />
        </motion.div>
      </motion.div>
    </div>
  )
}
