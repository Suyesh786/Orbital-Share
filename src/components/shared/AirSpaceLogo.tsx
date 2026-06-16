import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import logo from "@/assets/logo/airspace-logo.png"

interface AirSpaceLogoProps {
  size?: number
  className?: string
  intro?: boolean
}

export function AirSpaceLogo({
  size = 48,
  className,
  intro = false,
}: AirSpaceLogoProps) {
  return (
    <motion.div
      className={cn("relative flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      initial={intro ? { opacity: 0, scale: 0.96 } : false}
      animate={intro ? { opacity: 1, scale: 1 } : undefined}
      transition={
        intro
          ? { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }
          : undefined
      }
    >
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        draggable={false}
        decoding="async"
        className="h-full w-full max-h-full max-w-full object-contain"
        style={{ imageRendering: "auto" }}
        aria-hidden
      />
    </motion.div>
  )
}
