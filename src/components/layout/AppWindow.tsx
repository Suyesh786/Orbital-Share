import type { ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { DevSessionPanel } from "@/components/debug/DevSessionPanel"
import { TrustInboxLayer } from "@/components/trust/TrustInboxLayer"
import { UserProfile } from "@/components/profile/UserProfile"
import { NearDropMark } from "@/components/shared/NearDropMark"
import { BackgroundGlow } from "./BackgroundGlow"
import { TrafficLights } from "./TrafficLights"

const WINDOW_WIDTH = 920
const WINDOW_HEIGHT = 680

interface AppWindowProps {
  children: ReactNode
}

export function AppWindow({ children }: AppWindowProps) {
  const { pathname } = useLocation()
  const isHome = pathname === "/"

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#08090c] shadow-[0_20px_64px_rgba(0,0,0,0.55),0_0_1px_rgba(255,255,255,0.08)_inset]"
      style={{
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        maxWidth: "100vw",
        maxHeight: "100vh",
      }}
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_50%_0%,#141c28_0%,#0c1018_50%,#07080c_100%)]"
        aria-hidden
      />
      {!isHome ? <BackgroundGlow /> : null}

      <div className="relative z-10 flex h-full flex-col">
        <div className="pointer-events-none absolute top-3.5 right-5 z-30">
          <div className="pointer-events-auto flex items-center gap-2">
            <TrustInboxLayer />
            <UserProfile />
          </div>
        </div>

        <header className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-1">
          <TrafficLights />
          <div className="flex flex-1 items-center justify-center gap-2">
            {isHome ? (
              <>
                <NearDropMark size={14} />
                <span className="text-[11px] font-medium tracking-[0.14em] text-white/30 uppercase">
                  NearDrop
                </span>
              </>
            ) : (
              <span className="text-[11px] font-medium tracking-wide text-white/28">
                NearDrop
              </span>
            )}
          </div>
          <div className="w-[52px]" aria-hidden />
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden px-6 pb-5">
          {children}
        </main>

        {import.meta.env.DEV ? <DevSessionPanel /> : null}
      </div>
    </div>
  )
}
