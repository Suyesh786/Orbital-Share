import { motion } from "framer-motion"
import {
  FileText,
  FolderOpen,
  Image,
  Send,
  Video,
} from "lucide-react"
import { useNavigate } from "react-router-dom"
import { GlowButton } from "@/components/shared/GlowButton"
import { Logo } from "@/components/shared/Logo"
import { StatusSection } from "@/components/shared/StatusIndicator"
import {
  selectStartReceiveFlow,
  selectStartSendFlow,
  useTransferStore,
} from "@/store/useTransferStore"

const quickActions = [
  { label: "Photos", icon: Image },
  { label: "Videos", icon: Video },
  { label: "Documents", icon: FileText },
  { label: "Folders", icon: FolderOpen },
]

const stagger = {
  animate: {
    transition: { staggerChildren: 0.08 },
  },
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
}

export function HomePage() {
  const navigate = useNavigate()
  const startSendFlow = useTransferStore(selectStartSendFlow)
  const startReceiveFlow = useTransferStore(selectStartReceiveFlow)

  const handleSend = () => {
    startSendFlow()
    navigate("/select")
  }

  const handleReceive = () => {
    startReceiveFlow()
    navigate("/waiting")
  }

  return (
    <motion.div
      className="flex h-full flex-col"
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      <motion.header variants={fadeUp} className="flex flex-col items-center pt-2">
        <Logo />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          Orbital Share
        </h1>
        <p className="mt-1 text-sm text-white/45">
          Local Wireless File Transfer
        </p>
      </motion.header>

      <motion.div
        variants={fadeUp}
        className="mt-8 flex flex-1 flex-col justify-center gap-3 px-4"
      >
        <GlowButton onClick={handleSend}>
          <span className="flex items-center justify-center gap-2">
            <Send className="size-4" />
            Send Files
          </span>
        </GlowButton>
        <GlowButton onClick={handleReceive}>
          Receive Files
        </GlowButton>
      </motion.div>

      <motion.section variants={fadeUp} className="mt-6">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-widest text-white/30">
          Quick Actions
        </p>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map(({ label, icon: Icon }) => (
            <motion.button
              key={label}
              type="button"
              className="glass-panel flex flex-col items-center gap-2 rounded-xl py-3 text-white/50 transition-colors hover:border-white/15 hover:text-white/70"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <Icon className="size-4" />
              <span className="text-[10px] font-medium">{label}</span>
            </motion.button>
          ))}
        </div>
      </motion.section>

      <motion.footer variants={fadeUp} className="mt-auto pb-2 pt-6">
        <StatusSection />
      </motion.footer>
    </motion.div>
  )
}
