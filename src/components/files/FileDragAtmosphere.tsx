import { AnimatePresence, motion } from "framer-motion"

interface FileDragAtmosphereProps {
  active: boolean
}

/** Page-level ambient lift while files are dragged over the window. */
export function FileDragAtmosphere({ active }: FileDragAtmosphereProps) {
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[5] overflow-hidden"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="neardrop-drag-atmosphere-center absolute inset-0" />
          <div className="neardrop-drag-atmosphere-vignette absolute inset-0" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
