import { motion } from "framer-motion"
import { Download, Send } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { HomeActionButton } from "@/components/home/HomeActionButton"
import { HomeAmbientBackground } from "@/components/home/HomeAmbientBackground"
import { HomeStatusBar } from "@/components/home/HomeStatusBar"
import { NearDropMark } from "@/components/shared/NearDropMark"
import {
  selectStartReceiveFlow,
  selectStartSendFlow,
  useTransferStore,
} from "@/store/useTransferStore"

const easeOut = [0.22, 1, 0.36, 1] as const

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
    <div className="relative flex h-full min-h-0 flex-col">
      <HomeAmbientBackground intro />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-10 pb-4 pt-0">
          <div className="-mt-14 flex flex-col items-center">
            <NearDropMark size={80} intro />

            <motion.div
              className="mt-5 text-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, ease: easeOut, delay: 0.28 }}
            >
              <h1 className="neardrop-title text-[32px] font-semibold tracking-[-0.04em]">
                NearDrop
              </h1>
            </motion.div>

            <motion.p
              className="mt-2 text-center text-[14.5px] font-normal tracking-[0.04em] text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.38, ease: easeOut, delay: 0.4 }}
            >
              Local wireless file transfer
            </motion.p>

            <div className="mt-10 flex w-full max-w-[380px] flex-col gap-3">
              <HomeActionButton
                onClick={handleSend}
                icon={Send}
                primary
                introDelay={0.48}
              >
                Send files
              </HomeActionButton>
              <HomeActionButton
                onClick={handleReceive}
                icon={Download}
                introDelay={0.56}
              >
                Receive files
              </HomeActionButton>
            </div>
          </div>
        </div>

        <div className="px-7">
          <HomeStatusBar introDelay={0.72} />
        </div>
      </div>
    </div>
  )
}
