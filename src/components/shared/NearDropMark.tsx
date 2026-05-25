import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface NearDropMarkProps {
  size?: number
  className?: string
  /** Play one-time intro pulse with staged home entrance */
  intro?: boolean
}

/**
 * Abstract wireless transfer mark — orbital pulse + connection beam.
 */
export function NearDropMark({
  size = 64,
  className,
  intro = false,
}: NearDropMarkProps) {
  const id = "neardrop-mark-grad"
  const compact = size < 28

  return (
    <motion.div
      className={cn("relative flex items-center justify-center", className)}
      style={{ width: size, height: size }}
      initial={intro ? { opacity: 0, scale: 0.94 } : false}
      animate={intro ? { opacity: 1, scale: 1 } : undefined}
      transition={
        intro
          ? { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.12 }
          : undefined
      }
    >
      {!compact ? (
        <div
          className="neardrop-mark-glow absolute inset-[8%] rounded-full"
          aria-hidden
        />
      ) : null}
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        fill="none"
        className={cn("relative", !compact && "neardrop-mark-idle")}
        aria-hidden
      >
        <defs>
          <linearGradient id={id} x1="12" y1="12" x2="52" y2="52">
            <stop stopColor="#8ed4e4" />
            <stop offset="1" stopColor="#4a9fb0" />
          </linearGradient>
          <radialGradient id={`${id}-core`} cx="50%" cy="50%" r="50%">
            <stop stopColor="#9ee8f5" stopOpacity="0.95" />
            <stop offset="1" stopColor="#5eb8c9" stopOpacity="0.4" />
          </radialGradient>
        </defs>

        {!compact ? (
          <>
            <circle
              cx="32"
              cy="32"
              r="26"
              className="neardrop-mark-ripple"
              stroke={`url(#${id})`}
              strokeWidth="0.75"
              opacity="0.2"
            />
            <circle
              cx="32"
              cy="32"
              r="20"
              className="neardrop-mark-ripple neardrop-mark-ripple-delay"
              stroke={`url(#${id})`}
              strokeWidth="0.5"
              opacity="0.14"
            />
          </>
        ) : null}

        <circle
          cx="32"
          cy="32"
          r="23"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
          opacity="0.5"
        />
        {!compact ? (
          <ellipse
            cx="32"
            cy="32"
            rx="23"
            ry="10"
            stroke={`url(#${id})`}
            strokeWidth="1"
            opacity="0.35"
            className="neardrop-mark-orbit"
          />
        ) : null}

        {!compact ? (
          <path
            d="M 18 32 Q 32 18 46 32"
            stroke={`url(#${id})`}
            strokeWidth="1.25"
            strokeLinecap="round"
            fill="none"
            opacity="0.55"
          />
        ) : null}

        {!compact ? (
          <>
            <circle cx="18" cy="32" r="3" fill={`url(#${id}-core)`} opacity="0.9" />
            <circle cx="46" cy="32" r="3" fill={`url(#${id}-core)`} opacity="0.9" />
          </>
        ) : null}
        <circle cx="32" cy="32" r={compact ? 3.5 : 4.5} fill={`url(#${id}-core)`} />
        {!compact ? (
          <circle
            cx="32"
            cy="32"
            r="6"
            stroke={`url(#${id})`}
            strokeWidth="0.75"
            opacity="0.5"
            className="neardrop-mark-core-ring"
          />
        ) : null}
      </svg>
    </motion.div>
  )
}
