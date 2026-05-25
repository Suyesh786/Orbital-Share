import { motion } from "framer-motion"

/** Subtle depth for non-home routes — no cyan blooms. */
export function BackgroundGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <motion.div
        className="absolute -top-24 left-1/2 h-56 w-80 -translate-x-1/2 rounded-full bg-white/[0.03] blur-[90px]"
        animate={{ opacity: [0.35, 0.5, 0.35] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "36px 36px",
        }}
      />
    </div>
  )
}
