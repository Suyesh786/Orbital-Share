import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface HomeActionButtonProps {
  children: React.ReactNode
  onClick?: () => void
  icon?: LucideIcon
  primary?: boolean
  className?: string
  /** Stagger index for entrance */
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
        "group relative w-full overflow-hidden rounded-2xl border px-8 py-[20px]",
        "transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out",
        "bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.09)]",
        "shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_6px_20px_rgba(0,0,0,0.2)]",
        "hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.045)]",
        "hover:shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_8px_26px_rgba(0,0,0,0.26)]",
        primary && [
          "border-[rgba(94,184,201,0.22)]",
          "bg-[linear-gradient(165deg,rgba(94,184,201,0.1)_0%,rgba(255,255,255,0.04)_42%,rgba(255,255,255,0.02)_100%)]",
          "hover:border-[rgba(94,184,201,0.38)]",
          "hover:bg-[linear-gradient(165deg,rgba(94,184,201,0.14)_0%,rgba(255,255,255,0.06)_45%,rgba(255,255,255,0.03)_100%)]",
          "hover:shadow-[0_0_28px_rgba(94,184,201,0.1),0_1px_0_rgba(255,255,255,0.08)_inset,0_10px_28px_rgba(0,0,0,0.28)]",
        ],
        className
      )}
      whileHover={{ y: primary ? -1 : 0 }}
      whileTap={{ scale: 0.982, y: 0 }}
    >
      {primary ? (
        <span
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(94,184,201,0.12) 0%, transparent 70%)",
          }}
          aria-hidden
        />
      ) : null}
      <span className="relative flex items-center justify-center gap-3">
        {Icon ? (
          <Icon
            className={cn(
              "size-[18px] shrink-0 transition-colors duration-200",
              primary
                ? "text-[var(--neardrop-accent)] drop-shadow-[0_0_10px_rgba(94,184,201,0.35)]"
                : "text-white/48 group-hover:text-white/62"
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
        <span
          className={cn(
            "text-[16px] font-medium tracking-[-0.02em]",
            primary ? "text-white/95" : "text-white/88"
          )}
        >
          {children}
        </span>
      </span>
    </motion.button>
  )
}
