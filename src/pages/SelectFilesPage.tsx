import { useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { BackButton } from "@/components/shared/BackButton"
import { FileCard } from "@/components/shared/FileCard"
import { GlowButton } from "@/components/shared/GlowButton"
import {
  selectAddFiles,
  selectHasFileSelection,
  selectSelectedFiles,
  selectStartDiscovery,
  selectToggleFile,
  selectTotalTransferSize,
  useTransferStore,
} from "@/store/useTransferStore"
import { formatFileSize } from "@/lib/format"
import { cn } from "@/lib/utils"

export function SelectFilesPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const files = useTransferStore(selectSelectedFiles)
  const hasSelection = useTransferStore(selectHasFileSelection)
  const totalTransferSize = useTransferStore(selectTotalTransferSize)
  const addFiles = useTransferStore(selectAddFiles)
  const toggleFile = useTransferStore(selectToggleFile)
  const startDiscovery = useTransferStore(selectStartDiscovery)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return
      addFiles(Array.from(fileList))
    },
    [addFiles]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles]
  )

  const handleContinue = () => {
    if (!hasSelection) return
    startDiscovery()
    navigate("/discovery")
  }

  return (
    <div className="flex h-full flex-col">
      <BackButton to="/" />

      <header className="mt-2 text-center">
        <h1 className="text-xl font-semibold text-white">Select Files</h1>
        <p className="mt-1 text-sm text-white/45">
          Choose what you want to send
        </p>
      </header>

      <motion.div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          "glass-panel mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-cyan-500/25 px-6 py-10 transition-colors",
          "hover:border-cyan-400/40 hover:bg-cyan-500/5"
        )}
        whileHover={{ scale: 1.005 }}
      >
        <p className="text-base font-medium text-white/80">
          Drag & Drop Files Here
        </p>
        <p className="mt-1.5 text-sm text-white/40">or Click to Browse</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </motion.div>

      {files.length > 0 && (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="flex flex-col gap-2 pb-2">
            {files.map((f) => (
              <FileCard
                key={f.id}
                name={f.file.name}
                size={f.file.size}
                selected={f.selected}
                onToggle={() => toggleFile(f.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 shrink-0 pb-1">
        <GlowButton onClick={handleContinue} disabled={!hasSelection}>
          {hasSelection
            ? `Continue · ${formatFileSize(totalTransferSize)}`
            : "Continue"}
        </GlowButton>
      </div>
    </div>
  )
}
