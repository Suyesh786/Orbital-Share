import { AnimatePresence, motion } from "framer-motion"
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react"
import { GlowButton } from "@/components/shared/GlowButton"
import { Logo } from "@/components/shared/Logo"
import { useDeviceIdentity } from "@/hooks/useDeviceIdentity"
import { cn } from "@/lib/utils"
import {
  getDefaultUsernamePlaceholder,
  USERNAME_MIN_LENGTH,
} from "@/utils/device"

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 4,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const },
  },
}

export function UsernameModal() {
  const { needsOnboarding, submitUsername, normalizeUsername } =
    useDeviceIdentity()
  const inputId = useId()
  const [value, setValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const placeholder = getDefaultUsernamePlaceholder()

  const normalized = normalizeUsername(value)
  const isValid = normalized.length >= USERNAME_MIN_LENGTH

  useEffect(() => {
    if (!needsOnboarding) return
    setValue("")
    setError(null)
    setIsSubmitting(false)
  }, [needsOnboarding])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!isValid || isSubmitting) return

      setIsSubmitting(true)
      setError(null)

      const success = submitUsername(value)
      if (!success) {
        setError(`Use at least ${USERNAME_MIN_LENGTH} characters`)
        setIsSubmitting(false)
        return
      }

      setIsSubmitting(false)
    },
    [isValid, isSubmitting, submitUsername, value]
  )

  return (
    <AnimatePresence>
      {needsOnboarding && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center px-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${inputId}-title`}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.div
            className="absolute inset-0 bg-[#050608]/75 backdrop-blur-md"
            variants={backdropVariants}
            aria-hidden
          />

          <motion.div
            className="glass-panel glow-cyan relative w-full max-w-[380px] rounded-2xl px-8 py-10"
            variants={cardVariants}
          >
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
              aria-hidden
            />

            <div className="flex flex-col items-center text-center">
              <Logo />
              <h2
                id={`${inputId}-title`}
                className="mt-5 text-xl font-semibold tracking-tight text-white"
              >
                Welcome to AirSpace
              </h2>
              <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-white/45">
                Choose a device name visible to nearby devices
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label
                  htmlFor={inputId}
                  className="sr-only"
                >
                  Device name
                </label>
                <input
                  id={inputId}
                  type="text"
                  autoComplete="off"
                  autoFocus
                  spellCheck={false}
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value)
                    if (error) setError(null)
                  }}
                  className={cn(
                    "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5",
                    "text-[15px] font-medium tracking-tight text-white placeholder:text-white/25",
                    "outline-none transition-[border-color,box-shadow] duration-200",
                    "focus:border-cyan-400/35 focus:shadow-[0_0_0_3px_rgba(61,217,245,0.12),0_0_24px_rgba(61,217,245,0.08)]"
                  )}
                />
                {error ? (
                  <p className="text-center text-xs text-red-400/90">{error}</p>
                ) : (
                  <p className="text-center text-[11px] text-white/30">
                    {USERNAME_MIN_LENGTH}+ characters · visible on the local network
                  </p>
                )}
              </div>

              <GlowButton
                type="submit"
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? "Setting up…" : "Continue"}
              </GlowButton>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
