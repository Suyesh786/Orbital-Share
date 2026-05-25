import { motion } from "framer-motion"
import { formatDuration, formatFileSize, formatSpeed } from "@/lib/format"
import { cn } from "@/lib/utils"

interface OverallTransferProgressProps {
  progress: number
  bytesTransferred: number
  totalBytes: number
  speed: number
  estimatedTimeRemaining: number
}

export function OverallTransferProgress({
  progress,
  bytesTransferred,
  totalBytes,
  speed,
  estimatedTimeRemaining,
}: OverallTransferProgressProps) {
  const roundedProgress = Math.round(progress)
  const complete = progress >= 100

  return (
    <div
      className={cn(
        "glass-panel w-full rounded-2xl border border-cyan-500/10 p-4",
        "shadow-[0_0_32px_rgba(34,211,238,0.08)]"
      )}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/35">
            Overall transfer
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-cyan-300/95">
            {roundedProgress}%
          </p>
        </div>
        <p className="text-right text-xs tabular-nums text-white/45">
          {formatFileSize(bytesTransferred)}
          <span className="text-white/25"> / </span>
          {formatFileSize(totalBytes)}
        </p>
      </div>

      <div className="relative h-3.5 overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/5">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-600 via-cyan-400 to-blue-500"
          style={{ width: `${progress}%` }}
          transition={{ ease: "easeOut", duration: 0.25 }}
        />
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-cyan-300/40 blur-md"
          style={{ width: `${progress}%` }}
          transition={{ ease: "easeOut", duration: 0.25 }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/[0.03] py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/35">Speed</p>
          <p className="mt-0.5 text-xs font-medium text-cyan-300/90">
            {formatSpeed(speed)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/35">
            Remaining
          </p>
          <p className="mt-0.5 text-xs font-medium text-white/80">
            {complete ? "—" : formatDuration(estimatedTimeRemaining)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-white/35">
            Progress
          </p>
          <p className="mt-0.5 text-xs font-medium text-white/80 tabular-nums">
            {roundedProgress}%
          </p>
        </div>
      </div>
    </div>
  )
}
