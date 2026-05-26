const RINGS = [
  { radius: 80, ringClass: "neardrop-orbit-ring-inner" },
  { radius: 130, ringClass: "neardrop-orbit-ring-mid" },
  { radius: 180, ringClass: "neardrop-orbit-ring-outer" },
] as const

export function OrbitRings() {
  return (
    <>
      <div
        className="neardrop-orbit-spotlight absolute left-1/2 top-1/2 size-[min(380px,95%)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        aria-hidden
      />
      {RINGS.map(({ radius, ringClass }) => (
        <div
          key={radius}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${ringClass}`}
          style={{ width: radius * 2, height: radius * 2 }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <div
          key={`ripple-${i}`}
          className="neardrop-orbit-ripple absolute left-1/2 top-1/2 size-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ animationDelay: `${i * 1.4}s` }}
        />
      ))}
    </>
  )
}
