import type { ReactNode } from "react"

interface ReceiverDiscoveryPulseProps {
  children: ReactNode
  muted?: boolean
}

const WAVE_COUNT = 3

/**
 * Center-origin wireless waves — rings expand from avatar outward only.
 */
export function ReceiverDiscoveryPulse({
  children,
  muted = false,
}: ReceiverDiscoveryPulseProps) {
  const animationState = muted ? "paused" : "running"

  return (
    <div className="relative flex size-[240px] shrink-0 items-center justify-center overflow-hidden">
      <div
        className="airspace-receiver-spotlight absolute inset-0 rounded-full"
        style={{ animationPlayState: animationState, opacity: muted ? 0.38 : undefined }}
        aria-hidden
      />

      {Array.from({ length: WAVE_COUNT }, (_, i) => (
        <div
          key={i}
          className="airspace-receiver-wave absolute left-1/2 top-1/2 size-14 rounded-full"
          style={{
            animationDelay: `${i * 1.15}s`,
            animationPlayState: animationState,
            opacity: muted ? 0.18 : undefined,
          }}
          aria-hidden
        />
      ))}

      <div
        className="relative z-10 flex size-[84px] items-center justify-center rounded-full border border-[rgba(94,184,201,0.22)] bg-[rgba(255,255,255,0.04)] shadow-[0_0_28px_rgba(94,184,201,0.14),0_1px_0_rgba(255,255,255,0.08)_inset]"
        style={{ opacity: muted ? 0.7 : undefined }}
      >
        {children}
      </div>
    </div>
  )
}
