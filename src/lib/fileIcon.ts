import {
  File,
  FileImage,
  FileText,
  FileVideo,
  Music,
  type LucideIcon,
} from "lucide-react"

export function getFileIcon(name: string): LucideIcon {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) {
    return FileImage
  }
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return FileVideo
  }
  if (["mp3", "wav", "aac", "flac", "m4a"].includes(ext)) {
    return Music
  }
  if (["pdf", "doc", "docx", "txt", "md", "zip", "rar", "7z"].includes(ext)) {
    return FileText
  }
  return File
}
