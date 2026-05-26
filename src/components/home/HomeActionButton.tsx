import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface HomeActionButtonProps {
  children: React.ReactNode
  onClick?: () => void
  icon?: LucideIcon
  primary?: boolean
  className?: string
  introDelay?: number
}

export function HomeActionButton({
  children,
  onClick,
  icon: Icon,
  primary = false,
  className,
  introDelay = 0,
}: HomeActionButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.38,
        ease: [0.22, 1, 0.36, 1],
        delay: introDelay,
      }}
      className={cn(
        "neardrop-glass-button group relative w-full overflow-hidden rounded-2xl border px-14 py-[22px]",
        "transition-[border-color,background-color,box-shadow,transform] duration-300 ease-out",
        "border-[rgba(255,255,255,0.1)]",
        "shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_1px_0_rgba(0,0,0,0.2)_inset,0_10px_28px_rgba(0,0,0,0.22)]",
        "hover:border-[rgba(255,255,255,0.18)]",
        "hover:shadow-[0_1px_0_rgba(255,255,255,0.1)_inset,0_12px_32px_rgba(0,0,0,0.28),0_0_24px_rgba(94,184,201,0.06)]",
        primary && "neardrop-glass-button-primary",
        className
      )}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.984, y: 0 }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-60"
        aria-hidden
      />
      {primary ? (
        <span
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse 85% 70% at 50% 0%, rgba(94,184,201,0.14) 0%, transparent 68%)",
          }}
          aria-hidden
        />
      ) : null}
      <span className="relative flex items-center justify-center gap-3.5">
        {Icon ? (
          <Icon
            className={cn(
              "size-[19px] shrink-0 transition-[color,transform,filter] duration-300 ease-out",
              "group-hover:-translate-y-0.5",
              primary
                ? "text-[var(--neardrop-accent)] drop-shadow-[0_0_12px_rgba(94,184,201,0.4)] group-hover:drop-shadow-[0_0_16px_rgba(94,184,201,0.5)]"
                : "text-white/50 group-hover:text-white/68"
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
        <span
          className={cn(
            "text-[18px] font-medium tracking-[-0.02em] transition-colors duration-300",
            primary ? "text-white/[0.96]" : "text-white/90"
          )}
        >
          {children}
        </span>
      </span>
    </motion.button>
  )
}
