import { motion } from "framer-motion"

interface HomeAmbientBackgroundProps {
  intro?: boolean
}

/**
 * Homepage layers: navy base → haze → center spotlight (no large ring borders).
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
      <div className="neardrop-fog neardrop-fog-a absolute inset-[-25%]" />
      <div className="neardrop-fog neardrop-fog-b absolute inset-[-20%]" />
      <div className="neardrop-horizon-glow absolute inset-0" />
      <div className="neardrop-color-breathe absolute inset-[-10%]" />
      <div className="neardrop-aurora absolute inset-[-22%]" />
      <div className="neardrop-aurora neardrop-aurora-alt absolute inset-[-18%]" />
      <div className="neardrop-aurora neardrop-aurora-violet absolute inset-[-16%]" />
      <div className="neardrop-center-glow absolute left-1/2 top-[34%] size-[min(380px,72vw)] rounded-full" />
      <div className="neardrop-depth absolute inset-0" />
      <div className="neardrop-edge-vignette absolute inset-0" />
    </motion.div>
  )
}
