import { AnimatePresence, motion } from "framer-motion"

interface FileDropOverlayProps {
  visible: boolean
}

export function FileDropOverlay({ visible }: FileDropOverlayProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="airspace-drop-overlay-scrim absolute inset-0 rounded-2xl" />
          <motion.div
            className="relative flex flex-col items-center gap-1.5 px-6 text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.04 }}
          >
            <motion.p
              className="text-[17px] font-medium tracking-[-0.02em] text-white/92"
              animate={{ opacity: [0.88, 1, 0.88] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              Drop files here
            </motion.p>
            <p className="text-[13px] font-normal tracking-[0.02em] text-white/45">
              Release to add files
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
