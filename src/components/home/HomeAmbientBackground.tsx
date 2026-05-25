import { motion } from "framer-motion"

interface HomeAmbientBackgroundProps {
  intro?: boolean
}

/**
 * Homepage ambient — layered navy/teal atmosphere, CSS-only motion.
 */
export function HomeAmbientBackground({ intro = false }: HomeAmbientBackgroundProps) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
      initial={intro ? { opacity: 0 } : false}
      animate={intro ? { opacity: 1 } : undefined}
      transition={
        intro ? { duration: 0.65, ease: [0.22, 1, 0.36, 1] } : undefined
      }
    >
      <div className="neardrop-base-wash absolute inset-0" />

      <div className="neardrop-horizon-glow absolute inset-0" />

      <div className="neardrop-color-breathe absolute inset-[-10%]" />

      <div className="neardrop-aurora absolute inset-[-22%]" />
      <div className="neardrop-aurora neardrop-aurora-alt absolute inset-[-18%]" />
      <div className="neardrop-aurora neardrop-aurora-violet absolute inset-[-16%]" />

      <div className="absolute left-1/2 top-[34%] size-[min(580px,92vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="neardrop-wave neardrop-wave-1 absolute inset-0 rounded-full border border-[rgba(94,184,201,0.08)]" />
        <div className="neardrop-wave neardrop-wave-2 absolute inset-[11%] rounded-full border border-[rgba(72,140,165,0.07)]" />
        <div className="neardrop-wave neardrop-wave-3 absolute inset-[22%] rounded-full border border-[rgba(140,160,200,0.05)]" />
      </div>

      <div className="neardrop-center-glow absolute left-1/2 top-[36%] size-[min(440px,75vw)] rounded-full" />

      <div className="neardrop-depth absolute inset-0" />
      <div className="neardrop-edge-vignette absolute inset-0" />
    </motion.div>
  )
}
