import { listen } from "@tauri-apps/api/event"
import { useEffect, useState } from "react"

interface IncomingTransferData {
  senderUsername: string
  requesterSocketId?: string
  fileCount: number
}

/**
 * Minimal notification window rendered inside the custom Tauri notification
 * window (350×120, transparent, always-on-top). Spawned by the Rust backend
 * via show_incoming_transfer_notification command.
 */
export function NotificationPage() {
  const [data, setData] = useState<IncomingTransferData | null>(null)

  useEffect(() => {
    const unlisten = listen<IncomingTransferData>(
      "notification-incoming-transfer",
      (event) => {
        setData(event.payload)
      }
    )
    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  if (!data) return null

  const fileLabel = data.fileCount === 1 ? "1 file" : `${data.fileCount} files`
  const sender = data.senderUsername || "A nearby device"

  return (
    <div
      style={{
        width: "350px",
        height: "120px",
        borderRadius: "12px",
        background: "rgba(20,20,28,0.92)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "0 18px",
        fontFamily: "'Geist Variable', 'Inter', system-ui, sans-serif",
        color: "#fff",
      }}
      data-tauri-drag-region
    >
      {/* Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "10px",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: "22px",
        }}
      >
        📥
      </div>

      {/* Text */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "3px" }}>
          Incoming Transfer
        </div>
        <div
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.65)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sender} wants to send {fileLabel}
        </div>
      </div>
    </div>
  )
}
