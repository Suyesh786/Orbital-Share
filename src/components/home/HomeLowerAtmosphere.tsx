const LOWER_PARTICLES = [
  { left: "18%", bottom: "12%", delay: 0 },
  { left: "32%", bottom: "8%", delay: 2.1 },
  { left: "68%", bottom: "14%", delay: 1.2 },
  { left: "82%", bottom: "10%", delay: 3.4 },
  { left: "48%", bottom: "6%", delay: 1.8 },
] as const

/** Soft lower-half ambient depth for the home screen. */
export function HomeLowerAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[42%]" aria-hidden>
      <div className="airspace-lower-haze absolute inset-0" />
      <div className="airspace-lower-glow absolute bottom-[-8%] left-1/2 size-[min(640px,110vw)] rounded-full" />
      {LOWER_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="airspace-lower-particle absolute"
          style={{
            left: p.left,
            bottom: p.bottom,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
