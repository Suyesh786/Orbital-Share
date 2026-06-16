import { useCallback, useRef } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { FileDragAtmosphere } from "@/components/files/FileDragAtmosphere"
import { FileDropOverlay } from "@/components/files/FileDropOverlay"
import { BackButton } from "@/components/shared/BackButton"
import { FileCard } from "@/components/shared/FileCard"
import { GlowButton } from "@/components/shared/GlowButton"
import { useFileDragState } from "@/hooks/useFileDragState"
import {
  selectAddFiles,
  selectHasFileSelection,
  selectSelectedFiles,
  selectStartDiscovery,
  selectToggleFile,
  selectTotalTransferSize,
  selectTransferNoticeMessage,
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
  const noticeMessage = useTransferStore(selectTransferNoticeMessage)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return
      addFiles(Array.from(fileList))
    },
    [addFiles]
  )

  const { isDragActive, dropFlash, containerRef, dragHandlers } =
    useFileDragState({
      onFilesDropped: handleFiles,
    })

  const handleContinue = () => {
    if (!hasSelection) return
    startDiscovery()
    navigate("/discovery")
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 flex-col"
      {...dragHandlers}
    >
      <FileDragAtmosphere active={isDragActive} />

      <BackButton to="/" />

      <header className="relative z-[1] mt-2 text-center">
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
        className={cn(
          "relative z-[1] mt-6 flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10",
          "border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.02)]",
          "transition-[border-color,background-color,box-shadow] duration-300 ease-out",
          "hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.035)]",
          isDragActive && "airspace-drop-zone-active airspace-drop-zone-glow",
          dropFlash && "airspace-drop-zone-success"
        )}
        animate={{
          scale: dropFlash ? 1.008 : 1,
        }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        whileHover={isDragActive ? undefined : { scale: 1.005 }}
      >
        <FileDropOverlay visible={isDragActive} />

        <div
          className={cn(
            "relative z-[1] text-center transition-opacity duration-300",
            isDragActive && "opacity-0"
          )}
        >
          <p className="text-base font-medium text-white/80">
            Drag & Drop Files Here
          </p>
          <p className="mt-1.5 text-sm text-white/40">or Click to Browse</p>
        </div>

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
        <div className="relative z-[1] mt-4 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
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

      {noticeMessage && (
        <p className="relative z-[1] mt-3 text-center text-xs text-amber-300/90">
          {noticeMessage}
        </p>
      )}

      <div className="relative z-[1] mt-4 shrink-0 pb-1">
        <GlowButton onClick={handleContinue} disabled={!hasSelection}>
          {hasSelection
            ? `Continue · ${formatFileSize(totalTransferSize)}`
            : "Continue"}
        </GlowButton>
      </div>
    </div>
  )
}
