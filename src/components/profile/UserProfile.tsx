import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ProfileAvatar } from "@/components/profile/ProfileAvatar"
import { ProfileDropdown } from "@/components/profile/ProfileDropdown"
import { cn } from "@/lib/utils"
import {
  selectShowProfile,
  selectUsername,
  useTransferStore,
} from "@/store/useTransferStore"

export function UserProfile() {
  const showProfile = useTransferStore(selectShowProfile)
  const username = useTransferStore(selectUsername)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open])

  if (!showProfile) return null

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-[42px] cursor-pointer items-center gap-2.5 rounded-full pl-1.5 pr-3",
          "border border-cyan-400/20 bg-white/[0.04] backdrop-blur-xl",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]",
          "transition-[border-color,box-shadow] duration-200",
          "hover:border-cyan-400/35 hover:shadow-[0_0_20px_rgba(61,217,245,0.12)]"
        )}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
      >
        <ProfileAvatar username={username} size="sm" />
        <span className="max-w-[120px] truncate text-[13px] font-medium text-white/85">
          {username}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="text-white/40"
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </motion.span>
      </motion.button>

      <ProfileDropdown open={open} />
    </div>
  )
}
