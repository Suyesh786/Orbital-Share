import type { ReactNode } from "react"
import { DevSessionPanel } from "@/components/debug/DevSessionPanel"
import { UserProfile } from "@/components/profile/UserProfile"
import { BackgroundGlow } from "./BackgroundGlow"
import { TrafficLights } from "./TrafficLights"

const WINDOW_WIDTH = 920
const WINDOW_HEIGHT = 680

interface AppWindowProps {
  children: ReactNode
}

export function AppWindow({ children }: AppWindowProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-orbital-bg shadow-[0_24px_80px_rgba(0,0,0,0.6),0_0_1px_rgba(255,255,255,0.1)_inset]"
      style={{
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        maxWidth: "100vw",
        maxHeight: "100vh",
      }}
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-orbital-navy/80 via-orbital-bg to-[#060810]"
        aria-hidden
      />
      <BackgroundGlow />

      <div className="relative z-10 flex h-full flex-col">
        <div className="pointer-events-none absolute top-3.5 right-5 z-30">
          <div className="pointer-events-auto">
            <UserProfile />
          </div>
        </div>

        <header className="flex shrink-0 items-center gap-3 px-5 pt-4 pb-2">
          <TrafficLights />
          <span className="flex-1 text-center text-[11px] font-medium tracking-wide text-white/30">
            Orbital Share
          </span>
          <div className="w-[52px]" aria-hidden />
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden px-6 pb-6">
          {children}
        </main>

        <DevSessionPanel />
      </div>
    </div>
  )
}
