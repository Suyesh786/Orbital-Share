import { motion } from "framer-motion"

const RINGS = [80, 130, 180]

export function OrbitRings() {
  return (
    <>
      {RINGS.map((radius, i) => (
        <motion.div
          key={radius}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/20"
          style={{ width: radius * 2, height: radius * 2 }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{
            opacity: [0.15, 0.35, 0.15],
            scale: [1, 1.02, 1],
          }}
          transition={{
            duration: 3 + i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.4,
          }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`ripple-${i}`}
          className="absolute left-1/2 top-1/2 size-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/30"
          animate={{
            scale: [1, 6],
            opacity: [0.45, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeOut",
            delay: i * 1.3,
          }}
        />
      ))}
    </>
  )
}
