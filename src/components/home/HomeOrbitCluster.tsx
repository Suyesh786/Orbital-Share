import type { ReactNode } from "react"

const RINGS = [
  { inset: "9%", className: "airspace-home-orbit-inner" },
  { inset: "22%", className: "airspace-home-orbit-outer" },
] as const

interface HomeOrbitClusterProps {
  children: ReactNode
}

export function HomeOrbitCluster({ children }: HomeOrbitClusterProps) {
  return (
    <div className="relative mx-auto size-[min(272px,68vw)] max-h-[272px] max-w-[272px]">
      <div className="airspace-home-orbit-shell pointer-events-none absolute inset-0" aria-hidden>
        <div className="airspace-home-center-glow absolute inset-[14%] rounded-full" />
        <div className="absolute inset-[-10%]">
          <div className="airspace-hero-spotlight absolute inset-0 rounded-full" />
          <div className="airspace-hero-spotlight-inner absolute inset-[18%] rounded-full" />
        </div>
        <div className="airspace-home-orbit-spotlight absolute inset-[12%] rounded-full" />
        {RINGS.map(({ inset, className }) => (
          <div
            key={inset}
            className={`absolute rounded-full ${className}`}
            style={{ inset }}
          />
        ))}
      </div>

      <div className="relative z-10 flex h-full items-center justify-center">
        {children}
      </div>
    </div>
  )
}
