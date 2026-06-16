import { useCallback, useRef, useState } from "react"

function isFileDragEvent(event: React.DragEvent) {
  const types = event.dataTransfer.types
  return (
    types.includes("Files") ||
    types.includes("application/x-moz-file") ||
    types.includes("public.file-url")
  )
}

function isLeavingContainer(
  event: React.DragEvent,
  container: EventTarget & Element
) {
  const related = event.relatedTarget
  if (!related || !(related instanceof Node)) return true
  return !container.contains(related)
}

interface UseFileDragStateOptions {
  onFilesDropped: (files: FileList) => void
  /** Flash duration after successful drop (ms) */
  successFlashMs?: number
}

export function useFileDragState({
  onFilesDropped,
  successFlashMs = 520,
}: UseFileDragStateOptions) {
  const [isDragActive, setIsDragActive] = useState(false)
  const [dropFlash, setDropFlash] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFlashTimer = useCallback(() => {
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
  }, [])

  const triggerDropFlash = useCallback(() => {
    clearFlashTimer()
    setDropFlash(true)
    flashTimerRef.current = setTimeout(() => {
      setDropFlash(false)
      flashTimerRef.current = null
    }, successFlashMs)
  }, [clearFlashTimer, successFlashMs])

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!isFileDragEvent(event)) return

    const container = event.currentTarget
    if (!isLeavingContainer(event, container)) return

    setIsDragActive(true)
  }, [])

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!isFileDragEvent(event)) return

    const container = event.currentTarget
    if (!isLeavingContainer(event, container)) return

    setIsDragActive(false)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!isFileDragEvent(event)) return
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragActive(false)

      const { files } = event.dataTransfer
      if (!files?.length) return

      onFilesDropped(files)
      triggerDropFlash()
    },
    [onFilesDropped, triggerDropFlash]
  )

  return {
    isDragActive,
    dropFlash,
    containerRef,
    dragHandlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    },
  }
}
