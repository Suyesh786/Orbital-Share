import { AnimatePresence, motion } from "framer-motion"
import { Pencil } from "lucide-react"
import { useCallback, useEffect, useId, useState, type FormEvent } from "react"
import { ProfileAvatar } from "@/components/profile/ProfileAvatar"
import { GlowButton } from "@/components/shared/GlowButton"
import { useDeviceIdentity } from "@/hooks/useDeviceIdentity"
import { cn } from "@/lib/utils"
import { getUsernameValidationError } from "@/utils/device"

const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -4,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
  },
}

interface ProfileDropdownProps {
  open: boolean
}

export function ProfileDropdown({ open }: ProfileDropdownProps) {
  const { username, submitRename, normalizeUsername } = useDeviceIdentity()
  const inputId = useId()
  const [draft, setDraft] = useState(username)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(username)
    setError(null)
  }, [open, username])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const validationError = getUsernameValidationError(draft)
      if (validationError) {
        setError(validationError)
        return
      }

      const normalized = normalizeUsername(draft)
      if (normalized === username) {
        setError(null)
        return
      }

      const success = submitRename(draft)
      if (!success) {
        setError(getUsernameValidationError(draft))
        return
      }

      setError(null)
    },
    [draft, normalizeUsername, submitRename, username]
  )

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "absolute right-0 top-[calc(100%+10px)] z-50 w-[260px] overflow-hidden rounded-[18px]",
            "border border-cyan-400/20 bg-[#0c0e14]/85 backdrop-blur-2xl",
            "shadow-[0_16px_48px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset]"
          )}
          variants={dropdownVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="menu"
        >
          <div className="border-b border-white/[0.06] px-4 py-4">
            <div className="flex items-center gap-3">
              <ProfileAvatar username={username} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-white">
                  {username}
                </p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  This device is discoverable
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-4 py-4">
            <label
              htmlFor={inputId}
              className="text-[11px] font-medium uppercase tracking-wider text-white/35"
            >
              Rename Device
            </label>

            <div className="relative mt-2.5">
              <Pencil
                className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-cyan-400/60"
                aria-hidden
              />
              <input
                id={inputId}
                type="text"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  if (error) setError(null)
                }}
                spellCheck={false}
                autoComplete="off"
                className={cn(
                  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 pr-3 pl-9",
                  "text-[13px] font-medium text-white placeholder:text-white/25",
                  "outline-none transition-[border-color,box-shadow] duration-200",
                  "focus:border-cyan-400/35 focus:shadow-[0_0_0_3px_rgba(61,217,245,0.1)]"
                )}
              />
            </div>

            {error && (
              <p className="mt-2 text-[11px] text-red-400/90">{error}</p>
            )}

            <GlowButton type="submit" className="mt-3 py-2.5 text-[13px]">
              Confirm
            </GlowButton>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
