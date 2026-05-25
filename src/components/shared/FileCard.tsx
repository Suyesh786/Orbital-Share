import { motion } from "framer-motion"
import {
  File,
  FileImage,
  FileText,
  FileVideo,
  Music,
} from "lucide-react"
import { formatFileSize } from "@/lib/format"
import { cn } from "@/lib/utils"

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext))
    return FileImage
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return FileVideo
  if (["mp3", "wav", "aac", "flac"].includes(ext)) return Music
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return FileText
  return File
}

interface FileCardProps {
  name: string
  size: number
  selected: boolean
  onToggle: () => void
}

export function FileCard({ name, size, selected, onToggle }: FileCardProps) {
  const Icon = getFileIcon(name)

  return (
    <motion.button
      type="button"
      onClick={onToggle}
      className={cn(
        "glass-panel flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
        selected && "border-cyan-500/30 glow-cyan"
      )}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          selected ? "bg-cyan-500/15 text-cyan-400" : "bg-white/5 text-white/50"
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white/90">{name}</p>
        <p className="text-xs text-white/40">{formatFileSize(size)}</p>
      </div>
      <div
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          selected
            ? "border-cyan-400 bg-cyan-500/30"
            : "border-white/20 bg-transparent"
        )}
      >
        {selected && (
          <motion.svg
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="size-3 text-cyan-300"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2 6l3 3 5-6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </div>
    </motion.button>
  )
}
