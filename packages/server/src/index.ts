import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { WS_PATH } from "@dnd/shared";
import { config, hasApiKey } from "./config.js";
import { getDb } from "./db/index.js";
import { handleClose, handleRaw, type Connection } from "./ws/router.js";

getDb(); // create/migrate the database up front so a bad path fails loudly

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, model: config.dmModel, apiKey: hasApiKey() }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server: http, path: WS_PATH });

wss.on("connection", (socket) => {
  const conn: Connection = { socket, sessionId: null, playerId: null };

  socket.on("message", (data) => {
    void handleRaw(conn, data.toString()).catch((error: unknown) => {
      console.error("[ws] handler failed:", error);
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: "error", message: "Something went wrong on the server." }));
      }
    });
  });

  socket.on("close", () => handleClose(conn));
  socket.on("error", () => handleClose(conn));
});

http.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port} (ws ${WS_PATH})`);
  console.log(`[server] DM model: ${config.dmModel} @ effort ${config.dmEffort}`);
  if (!hasApiKey()) {
    console.warn("[server] ANTHROPIC_API_KEY is not set — the DM will not be able to narrate.");
  }
});
