interface PassageMarkProps {
  size?: number
}

/** Monochrome arc mark for Passage home — accent used sparingly. */
export function PassageMark({ size = 56 }: PassageMarkProps) {
  return (
    <svg
      viewBox="0 0 56 56"
      fill="none"
      width={size}
      height={size}
      aria-hidden
      className="text-white/70"
    >
      <circle
        cx="28"
        cy="28"
        r="22"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.35"
      />
      <ellipse
        cx="28"
        cy="28"
        rx="22"
        ry="9"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.22"
        transform="rotate(-18 28 28)"
      />
      <circle
        cx="28"
        cy="28"
        r="5"
        fill="var(--passage-accent)"
        opacity="0.85"
      />
    </svg>
  )
}
