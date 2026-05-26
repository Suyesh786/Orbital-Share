import type { ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { TrustInboxLayer } from "@/components/trust/TrustInboxLayer"
import { UserProfile } from "@/components/profile/UserProfile"
import { isElectron } from "@/lib/electron"
import { cn } from "@/lib/utils"
import { BackgroundGlow } from "./BackgroundGlow"
import { TrafficLights } from "./TrafficLights"

/** Browser preview frame — keep in sync with electron/main.cjs */
export const APP_WINDOW_WIDTH = 1080
export const APP_WINDOW_HEIGHT = 760

interface AppWindowProps {
  children: ReactNode
}

export function AppWindow({ children }: AppWindowProps) {
  const { pathname } = useLocation()
  const isHome = pathname === "/"
  const desktop = isElectron()

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden bg-[#08090c]",
        desktop
          ? "h-screen w-screen"
          : "rounded-2xl border border-white/[0.07] shadow-[0_20px_64px_rgba(0,0,0,0.55),0_0_1px_rgba(255,255,255,0.08)_inset]"
      )}
      style={
        desktop
          ? undefined
          : {
              width: APP_WINDOW_WIDTH,
              height: APP_WINDOW_HEIGHT,
              maxWidth: "100vw",
              maxHeight: "100vh",
            }
      }
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_90%_80%_at_50%_0%,#141c28_0%,#0c1018_50%,#07080c_100%)]"
        aria-hidden
      />
      {!isHome ? <BackgroundGlow /> : null}
      <div className="neardrop-window-vignette pointer-events-none absolute inset-0 z-[2]" aria-hidden />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <div className="electron-no-drag pointer-events-none absolute top-3.5 right-5 z-30">
          <div className="pointer-events-auto flex items-center gap-2">
            <TrustInboxLayer />
            <UserProfile />
          </div>
        </div>

        <header className="electron-drag flex shrink-0 items-center gap-3 px-5 pt-4 pb-1">
          <div className="electron-no-drag w-[52px] shrink-0">
            <TrafficLights />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            <span
              className={
                isHome
                  ? "text-[11px] font-medium tracking-[0.12em] text-white/32"
                  : "text-[11px] font-medium tracking-wide text-white/28"
              }
            >
              NearDrop
            </span>
          </div>
          <div className="w-[52px] shrink-0" aria-hidden />
        </header>

        <main className="relative min-h-0 flex-1 overflow-hidden px-6 pb-5">
          {children}
        </main>
      </div>
    </div>
  )
}
