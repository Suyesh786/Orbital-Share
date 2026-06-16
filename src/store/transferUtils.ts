import type { SelectedFile } from "@/types/device"

export function computeTotalTransferSize(files: SelectedFile[]): number {
  return files
    .filter((f) => f.selected)
    .reduce((sum, f) => sum + f.file.size, 0)
}

export function getActiveSelectedFiles(files: SelectedFile[]): SelectedFile[] {
  return files.filter((f) => f.selected)
}
