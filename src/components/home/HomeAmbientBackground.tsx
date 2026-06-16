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
      <div className="airspace-base-wash absolute inset-0" />
      <div className="airspace-fog airspace-fog-a absolute inset-[-25%]" />
      <div className="airspace-fog airspace-fog-b absolute inset-[-20%]" />
      <div className="airspace-horizon-glow absolute inset-0" />
      <div className="airspace-color-breathe absolute inset-[-10%]" />
      <div className="airspace-aurora absolute inset-[-22%]" />
      <div className="airspace-aurora airspace-aurora-alt absolute inset-[-18%]" />
      <div className="airspace-aurora airspace-aurora-violet absolute inset-[-16%]" />
      <div className="airspace-depth absolute inset-0" />
      <div className="airspace-edge-vignette absolute inset-0" />
    </motion.div>
  )
}
