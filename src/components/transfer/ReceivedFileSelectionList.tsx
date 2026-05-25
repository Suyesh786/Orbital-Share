import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { getFileIcon } from "@/lib/fileIcon"
import { formatFileSize } from "@/lib/format"
import type { ReceivedFileMemory } from "@/types/device"
import { cn } from "@/lib/utils"

interface ReceivedFileSelectionListProps {
  files: ReceivedFileMemory[]
  selectedByFileId: Record<string, boolean>
  onToggle: (fileId: string) => void
}

export function ReceivedFileSelectionList({
  files,
  selectedByFileId,
  onToggle,
}: ReceivedFileSelectionListProps) {
  if (files.length === 0) return null

  return (
    <ul className="mt-6 max-h-52 w-full space-y-2 overflow-y-auto pr-0.5 text-left">
      {files.map((file) => {
        const selected = selectedByFileId[file.fileId] ?? false
        const Icon = getFileIcon(file.name)

        return (
          <li key={file.fileId}>
            <motion.button
              type="button"
              onClick={() => onToggle(file.fileId)}
              className={cn(
                "glass-panel flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-[box-shadow,border-color,background-color]",
                selected
                  ? "border-cyan-500/35 glow-cyan bg-cyan-500/[0.04]"
                  : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
              )}
              whileHover={{ scale: 1.008 }}
              whileTap={{ scale: 0.992 }}
              layout
            >
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  selected
                    ? "bg-cyan-500/15 text-cyan-400"
                    : "bg-white/5 text-white/45"
                )}
              >
                <Icon className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/90">
                  {file.name}
                </p>
                <p className="text-xs text-white/40">{formatFileSize(file.size)}</p>
              </div>

              <div
                className={cn(
                  "relative flex size-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200",
                  selected
                    ? "border-cyan-400/80 bg-cyan-500/25 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                    : "border-white/20 bg-white/[0.02]"
                )}
              >
                {selected && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <Check className="size-3 text-cyan-200" strokeWidth={2.5} />
                  </motion.span>
                )}
              </div>
            </motion.button>
          </li>
        )
      })}
    </ul>
  )
}
