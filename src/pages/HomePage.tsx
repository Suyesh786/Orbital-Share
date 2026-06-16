import { motion } from "framer-motion"
import { Download, Send } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { HomeActionButton } from "@/components/home/HomeActionButton"
import { HomeAmbientBackground } from "@/components/home/HomeAmbientBackground"
import { HomeBrandRow } from "@/components/home/HomeBrandRow"
import { HomeLowerAtmosphere } from "@/components/home/HomeLowerAtmosphere"
import { HomeOrbitCluster } from "@/components/home/HomeOrbitCluster"
import { HomeStatusBar } from "@/components/home/HomeStatusBar"
import { getDesktopApi } from "@/lib/electron"
import {
  selectStartSendFlow,
  useTransferStore,
} from "@/store/useTransferStore"

const easeOut = [0.22, 1, 0.36, 1] as const

export function HomePage() {
  const navigate = useNavigate()
  const startSendFlow = useTransferStore(selectStartSendFlow)

  const handleSend = () => {
    const desktopApi = getDesktopApi()
    if (desktopApi) {
      void desktopApi.setReceiverEnabled(false)
    }
    startSendFlow()
    navigate("/select")
  }

  const handleReceive = () => {
    const desktopApi = getDesktopApi()
    if (desktopApi) {
      void desktopApi.setReceiverEnabled(true)
    } else {
      useTransferStore.getState().startReceiveFlow()
    }
    navigate("/waiting")
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <HomeAmbientBackground intro />
      <HomeLowerAtmosphere />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div className="relative flex flex-1 flex-col items-center px-10 pb-4 pt-[5.75%]">
          <div className="relative z-[1] flex w-full max-w-[580px] flex-col items-center">
            <div className="relative flex w-full flex-col items-center py-1.5">
              <HomeOrbitCluster>
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                  <div className="flex flex-col items-center -translate-x-3 translate-y-4">
                    <HomeBrandRow intro />
                    <motion.p
                      className="mt-4 text-center text-[15px] font-normal tracking-[0.05em] text-white/40"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.38, ease: easeOut, delay: 0.32 }}
                    >
                      Local wireless file transfer
                    </motion.p>
                  </div>
                </div>
              </HomeOrbitCluster>
            </div>

            <div className="mt-[5rem] flex w-full flex-col items-center gap-3.5">
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

        <div className="relative z-[1] px-7">
          <HomeStatusBar introDelay={0.72} />
        </div>
      </div>
    </div>
  )
}
