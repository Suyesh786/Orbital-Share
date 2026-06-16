import { cn } from "@/lib/utils"
import { getUsernameInitial } from "@/utils/device"

const sizeStyles = {
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-12 text-base",
} as const

interface ProfileAvatarProps {
  username: string
  size?: keyof typeof sizeStyles
  className?: string
}

export function ProfileAvatar({
  username,
  size = "sm",
  className,
}: ProfileAvatarProps) {
  const initial = getUsernameInitial(username)

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        "bg-gradient-to-br from-cyan-400/90 via-cyan-500/90 to-blue-600/90",
        "shadow-[0_0_12px_rgba(61,217,245,0.35)]",
        sizeStyles[size],
        className
      )}
      aria-hidden
    >
      {initial}
    </div>
  )
}
