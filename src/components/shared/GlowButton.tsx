import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface GlowButtonProps {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  type?: "button" | "submit"
}

export function GlowButton({
  children,
  onClick,
  className,
  disabled,
  type = "button",
}: GlowButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative w-full overflow-hidden rounded-full px-8 py-4 text-[15px] font-medium tracking-wide text-white transition-opacity",
        "bg-gradient-to-r from-cyan-600/90 via-cyan-500/90 to-blue-600/90",
        "shadow-[0_0_30px_rgba(61,217,245,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        className
      )}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <motion.span
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-100%" }}
        whileHover={{ x: "100%" }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      <span className="relative">{children}</span>
    </motion.button>
  )
}
