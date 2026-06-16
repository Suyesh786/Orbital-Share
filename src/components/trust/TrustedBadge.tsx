import { cn } from "@/lib/utils"

interface TrustedBadgeProps {
  className?: string
  variant?: "inline" | "subtle"
}

export function TrustedBadge({ className, variant = "inline" }: TrustedBadgeProps) {
  if (variant === "subtle") {
    return (
      <span
        className={cn(
          "mt-0.5 text-[8.5px] font-medium tracking-[0.06em]",
          "text-cyan-300/50 [text-shadow:0_0_10px_rgba(52,211,153,0.12)]",
          className
        )}
      >
        (Trusted Device)
      </span>
    )
  }

  return (
    <span
      className={cn(
        "text-[9px] font-medium tracking-wide text-cyan-400/70",
        className
      )}
    >
      (Trusted Device)
    </span>
  )
}
