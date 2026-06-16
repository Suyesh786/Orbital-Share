import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { getFileIcon } from "@/lib/fileIcon"
import type { PerFileTransferProgress } from "@/types/device"
import { cn } from "@/lib/utils"

interface PerFileTransferProgressListProps {
  fileIds: string[]
  progressByFileId: Record<string, PerFileTransferProgress>
}

function rowStatusText(status: PerFileTransferProgress["status"]): string {
  switch (status) {
    case "completed":
      return "Completed"
    case "transferring":
      return "Transferring…"
    default:
      return "Waiting…"
  }
}

export function PerFileTransferProgressList({
  fileIds,
  progressByFileId,
}: PerFileTransferProgressListProps) {
  if (fileIds.length === 0) return null

  return (
    <ul className="space-y-2.5">
      {fileIds.map((fileId) => {
        const entry = progressByFileId[fileId]
        if (!entry) return null

        const Icon = getFileIcon(entry.name)
        const showBar = entry.status !== "waiting"
        const roundedPct = Math.round(entry.percentage)
        const isActive = entry.status === "transferring"

        return (
          <li
            key={fileId}
            className={cn(
              "rounded-xl border px-3 py-2.5 transition-colors",
              isActive
                ? "border-cyan-500/25 bg-cyan-500/[0.06]"
                : "border-white/5 bg-white/[0.02]"
            )}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  entry.status === "completed"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : isActive
                      ? "bg-cyan-500/15 text-cyan-400"
                      : "bg-white/5 text-white/40"
                )}
              >
                {entry.status === "completed" ? (
                  <Check className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <Icon className="size-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/85">
                  {entry.name}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[10px]",
                    entry.status === "completed"
                      ? "text-emerald-400/80"
                      : isActive
                        ? "text-cyan-400/75"
                        : "text-white/35"
                  )}
                >
                  {entry.status === "waiting"
                    ? rowStatusText(entry.status)
                    : `${rowStatusText(entry.status)} · ${roundedPct}%`}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium tabular-nums",
                  entry.status === "completed"
                    ? "text-emerald-400/90"
                    : isActive
                      ? "text-cyan-400/90"
                      : "text-white/30"
                )}
              >
                {showBar ? `${roundedPct}%` : "—"}
              </span>
            </div>
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/5">
              {showBar ? (
                <motion.div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    entry.status === "completed"
                      ? "bg-gradient-to-r from-emerald-600/80 to-emerald-400/80"
                      : "bg-gradient-to-r from-cyan-600/80 to-cyan-400/80"
                  )}
                  style={{ width: `${entry.percentage}%` }}
                  transition={{ ease: "easeOut", duration: 0.2 }}
                />
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
