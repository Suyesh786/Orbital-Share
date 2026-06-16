import { createServer } from "node:http"
import cors from "cors"
import { WebSocketServer } from "ws"
import { tryAcceptWebSocketConnection } from "./websocketHandlers.js"
import { startBackgroundCleanupSweep } from "./backgroundCleanup.js"

export const PORT = Number(process.env.ORBITAL_SHARE_PORT ?? 8080)
export const HOST = process.env.ORBITAL_SHARE_HOST?.trim() || "0.0.0.0"
const WS_HEARTBEAT_INTERVAL_MS = 30_000

const httpServer = createServer((req, res) => {
  cors({ origin: true })(req, res, () => {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("AirSpace WebSocket server\n")
  })
})

const wss = new WebSocketServer({ server: httpServer })

wss.on("connection", (ws) => {
  ws.isAlive = true
  ws.on("pong", () => {
    ws.isAlive = true
  })
  tryAcceptWebSocketConnection(ws)
})

wss.on("error", (error) => {
  console.error("[WS] Server error:", error.message)
})

httpServer.listen(PORT, HOST, () => {
  startBackgroundCleanupSweep()
  console.log(`[WS] AirSpace server listening on ws://${HOST}:${PORT}`)
})

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate()
      continue
    }

    ws.isAlive = false
    ws.ping()
  }
}, WS_HEARTBEAT_INTERVAL_MS)

if (typeof heartbeatTimer.unref === "function") {
  heartbeatTimer.unref()
}
