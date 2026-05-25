import { motion } from "framer-motion"

interface LogoProps {
  size?: "sm" | "md"
}

export function Logo({ size = "md" }: LogoProps) {
  const dim = size === "sm" ? 36 : 48

  return (
    <motion.div
      className="relative flex items-center justify-center"
      style={{ width: dim, height: dim }}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-md" />
      <svg
        viewBox="0 0 48 48"
        fill="none"
        className="relative"
        style={{ width: dim, height: dim }}
        aria-hidden
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="url(#logoGrad)"
          strokeWidth="1.5"
          fill="none"
          opacity="0.6"
        />
        <circle cx="24" cy="24" r="6" fill="url(#logoGrad)" />
        <ellipse
          cx="24"
          cy="24"
          rx="20"
          ry="8"
          stroke="url(#logoGrad)"
          strokeWidth="1"
          fill="none"
          opacity="0.4"
          transform="rotate(-20 24 24)"
        />
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48">
            <stop stopColor="#7ee8fc" />
            <stop offset="1" stopColor="#3dd9f5" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  )
}
