import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { useEffect, useState } from "react"

export function TrafficLights() {
  const appWindow = getCurrentWebviewWindow()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Track maximize state so green button toggles correctly
    let unlisten: (() => void) | undefined
    appWindow.isMaximized().then((m) => setIsMaximized(m))
    const setupListener = async () => {
      unlisten = await appWindow.onResized(async () => {
        const m = await appWindow.isMaximized()
        setIsMaximized(m)
      })
    }
    void setupListener()
    return () => { unlisten?.() }
  }, [appWindow])

  const handleClose = () => {
    // Triggers our Rust CloseRequested handler which calls hide() instead of destroy
    appWindow.close()
  }

  const handleMinimize = () => {
    appWindow.minimize()
  }

  const handleZoom = () => {
    if (isMaximized) {
      appWindow.unmaximize()
    } else {
      appWindow.maximize()
    }
  }

  return (
    <div className="flex items-center gap-2" aria-hidden>
      <button
        id="traffic-close"
        onClick={handleClose}
        aria-label="Close window"
        className="size-3 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)] hover:brightness-90 active:brightness-75 transition-[filter]"
      />
      <button
        id="traffic-minimize"
        onClick={handleMinimize}
        aria-label="Minimize window"
        className="size-3 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)] hover:brightness-90 active:brightness-75 transition-[filter]"
      />
      <button
        id="traffic-zoom"
        onClick={handleZoom}
        aria-label="Zoom window"
        className="size-3 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.2)] hover:brightness-90 active:brightness-75 transition-[filter]"
      />
    </div>
  )
}
