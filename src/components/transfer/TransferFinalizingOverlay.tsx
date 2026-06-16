const SUBTITLES = [
  "Preparing files…",
  "Reconstructing secure download…",
  "Optimizing received data…",
  "Verifying completed transfer…",
] as const

interface TransferFinalizingOverlayProps {
  visible: boolean
}

/**
 * Fullscreen processing state for large receiver finalization.
 * Uses compositor-only CSS animations so motion continues during main-thread work.
 */
export function TransferFinalizingOverlay({
  visible,
}: TransferFinalizingOverlayProps) {
  if (!visible) return null

  return (
    <div
      className="transfer-finalize-overlay fixed inset-0 z-[60] flex items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Finalizing transfer"
    >
      <div className="transfer-finalize-vignette pointer-events-none absolute inset-0" />

      <div className="transfer-finalize-panel relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <div className="transfer-finalize-wave mb-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="transfer-finalize-wave-bar h-full w-full origin-center rounded-full bg-gradient-to-r from-cyan-600/80 via-cyan-400 to-blue-500/80" />
        </div>

        <h2 className="text-lg font-semibold tracking-tight text-white">
          Finalizing Transfer
        </h2>

        <div className="relative mt-3 h-5 w-full max-w-[280px]">
          {SUBTITLES.map((line, index) => (
            <p
              key={line}
              className="transfer-finalize-subtitle absolute inset-x-0 text-sm text-cyan-300/75"
              style={{ animationDelay: `${index * 4}s` }}
            >
              {line}
            </p>
          ))}
        </div>

        <p className="mt-8 text-[11px] text-white/35">
          Large files may take a few moments
        </p>
      </div>
    </div>
  )
}
