import { motion } from "framer-motion"
import { NearDropLogo } from "@/components/shared/NearDropLogo"

const easeOut = [0.22, 1, 0.36, 1] as const

interface HomeBrandRowProps {
  intro?: boolean
}

/** Single-line branding: [logo] NearDrop */
export function HomeBrandRow({ intro = false }: HomeBrandRowProps) {
  return (
    <motion.div
      className="relative z-10 inline-flex w-fit items-center gap-3"
      initial={intro ? { opacity: 0, y: 5 } : false}
      animate={intro ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.45, ease: easeOut, delay: 0.18 }}
    >
      <NearDropLogo size={68} className="shrink-0 translate-y-px" />
      <h1 className="neardrop-title neardrop-title-inline -translate-x-px text-[38px] font-semibold leading-none tracking-[-0.04em]">
        NearDrop
      </h1>
    </motion.div>
  )
}
