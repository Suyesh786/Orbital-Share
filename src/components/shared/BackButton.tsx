import { ChevronLeft } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"

interface BackButtonProps {
  to?: string
  onBack?: () => void
  label?: string
}

export function BackButton({ to, onBack, label = "Back" }: BackButtonProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (onBack) {
      onBack()
      return
    }
    if (to) {
      navigate(to)
      return
    }
    navigate(-1)
  }

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
      whileHover={{ x: -2 }}
      whileTap={{ scale: 0.97 }}
    >
      <ChevronLeft className="size-4" />
      {label}
    </motion.button>
  )
}
