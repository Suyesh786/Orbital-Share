import { motion } from "framer-motion"
import type { ReactNode } from "react"

const ease = [0.22, 1, 0.36, 1] as const

const defaultVariants = {
  initial: {
    opacity: 0,
    y: 8,
    scale: 0.992,
    filter: "blur(3px)",
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      duration: 0.32,
      ease,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.994,
    filter: "blur(3px)",
    transition: {
      duration: 0.28,
      ease,
    },
  },
}

const homeVariants = {
  initial: {
    opacity: 0,
    scale: 0.994,
    filter: "blur(2px)",
  },
  animate: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.32, ease },
  },
  exit: {
    opacity: 0,
    scale: 0.996,
    filter: "blur(2px)",
    transition: { duration: 0.26, ease },
  },
}

interface PageTransitionProps {
  children: ReactNode
  className?: string
  variant?: "default" | "home"
}

export function PageTransition({
  children,
  className,
  variant = "default",
}: PageTransitionProps) {
  return (
    <motion.div
      variants={variant === "home" ? homeVariants : defaultVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      style={{ willChange: "opacity, transform, filter" }}
    >
      {children}
    </motion.div>
  )
}
