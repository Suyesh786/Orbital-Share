const PARTICLES = [
  { left: "46%", top: "38%", delay: 0 },
  { left: "54%", top: "42%", delay: 1.2 },
  { left: "42%", top: "48%", delay: 2.4 },
  { left: "58%", top: "50%", delay: 0.8 },
  { left: "50%", top: "36%", delay: 3.1 },
  { left: "44%", top: "44%", delay: 1.8 },
] as const

/** Minimal wireless atmosphere — 6 slow-drifting particles. */
export function OrbitAmbientParticles() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {PARTICLES.map((p, index) => (
        <span
          key={index}
          className="neardrop-orbit-particle absolute"
          style={{
            left: p.left,
            top: p.top,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
