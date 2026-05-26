const RINGS = [
  { inset: "6%", className: "neardrop-home-orbit-inner" },
  { inset: "20%", className: "neardrop-home-orbit-outer" },
] as const

/**
 * Faint rings contained behind logo — never extends to screen edges.
 */
export function HomeOrbitAtmosphere() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 z-0 size-[min(240px,62vw)] max-h-[240px] max-w-[240px] -translate-x-1/2 -translate-y-1/2 overflow-hidden"
      aria-hidden
    >
      <div className="neardrop-home-orbit-spotlight absolute inset-0 rounded-full" />
      {RINGS.map(({ inset, className }) => (
        <div
          key={inset}
          className={`absolute rounded-full ${className}`}
          style={{ inset }}
        />
      ))}
    </div>
  )
}
