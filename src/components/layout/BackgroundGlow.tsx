import { motion } from "framer-motion"

export function BackgroundGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-32 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[100px]"
        animate={{
          opacity: [0.4, 0.7, 0.4],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-24 -left-16 h-56 w-72 rounded-full bg-blue-600/15 blur-[90px]"
        animate={{
          opacity: [0.3, 0.55, 0.3],
          x: [0, 20, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-12 h-48 w-64 rounded-full bg-indigo-600/10 blur-[80px]"
        animate={{
          opacity: [0.25, 0.5, 0.25],
          y: [0, -15, 0],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)`,
          backgroundSize: "32px 32px",
        }}
      />
    </div>
  )
}
