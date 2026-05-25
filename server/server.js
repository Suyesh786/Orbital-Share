import { createServer } from "node:http"
import cors from "cors"
import { WebSocketServer } from "ws"
import { tryAcceptWebSocketConnection } from "./websocketHandlers.js"
import { startBackgroundCleanupSweep } from "./backgroundCleanup.js"

const PORT = 8080
const httpServer = createServer((req, res) => {
  cors({ origin: true })(req, res, () => {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("Orbital Share WebSocket server\n")
  })
})

const wss = new WebSocketServer({ server: httpServer })

wss.on("connection", (ws) => {
  tryAcceptWebSocketConnection(ws)
})

wss.on("error", (error) => {
  console.error("[WS] Server error:", error.message)
})

httpServer.listen(PORT, () => {
  startBackgroundCleanupSweep()
  console.log(`[WS] Orbital Share server listening on ws://localhost:${PORT}`)
})
