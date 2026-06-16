/** Centered spotlight — gradient only, no ring borders. */
export function HomeHeroGlow() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[38%] z-0 size-[min(340px,68vw)] max-h-[340px] max-w-[340px] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
      aria-hidden
    >
      <div className="airspace-hero-spotlight absolute inset-0 rounded-full" />
      <div className="airspace-hero-spotlight-inner absolute inset-[18%] rounded-full" />
    </div>
  )
}
