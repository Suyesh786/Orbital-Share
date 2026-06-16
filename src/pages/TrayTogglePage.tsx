import { useEffect, useState } from "react"
import { getDesktopApi } from "@/lib/electron"
import { cn } from "@/lib/utils"

export function TrayTogglePage() {
  const desktopApi = getDesktopApi()
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add("tray-popover-route")

    return () => {
      document.documentElement.classList.remove("tray-popover-route")
    }
  }, [])

  useEffect(() => {
    if (!desktopApi) return

    let active = true

    void desktopApi.getReceiverEnabled().then((nextEnabled) => {
      if (!active) return
      setEnabled(nextEnabled)
      setReady(true)
    })

    const unsubscribe = desktopApi.onReceiverEnabledChanged((nextEnabled) => {
      setEnabled(nextEnabled)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [desktopApi])

  const handleToggle = () => {
    if (!desktopApi) return
    void desktopApi.setReceiverEnabled(!enabled)
  }

  const disabled = !ready
  const statusText = enabled ? "Visible to nearby devices" : "Not discoverable"

  return (
    <div data-tauri-drag-region className="electron-drag relative flex h-full w-full items-center overflow-hidden rounded-[18px] border border-white/[0.11] bg-[linear-gradient(180deg,rgba(76,78,82,0.58)_0%,rgba(34,36,40,0.52)_100%)] px-[18px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.2]" />

      <div className="relative flex w-full items-center justify-between gap-5">
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-semibold leading-[19px] text-white/95">
            AirSpace
          </h1>
          <p className="mt-0.5 truncate text-[11.5px] font-medium leading-[15px] text-white/[0.6]">
            {statusText}
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-pressed={enabled}
          aria-label={`Turn receiver ${enabled ? "off" : "on"}`}
          className={cn(
            "electron-no-drag group relative h-[26px] w-[48px] shrink-0 rounded-full border transition-[background,border-color,box-shadow,opacity] duration-200 ease-out",
            enabled
              ? "border-white/[0.28] bg-[#55c7e8]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_11px_rgba(85,199,232,0.22)] hover:bg-[#63cdea]/85"
              : "border-white/[0.13] bg-white/[0.13] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-white/[0.17]",
            disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
          )}
          title="Toggle discoverability"
        >
          <span
            className={cn(
              "absolute left-[2px] top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_1px_rgba(255,255,255,0.55)_inset,0_2px_7px_rgba(0,0,0,0.24)] transition-transform duration-200 ease-out group-hover:scale-[1.01]",
              enabled && "translate-x-[22px]"
            )}
          />
        </button>
      </div>
    </div>
  )
}
