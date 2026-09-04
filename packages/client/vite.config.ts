import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@dnd/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Lets the client talk to ws://<same-origin>/ws in both dev and preview.
    proxy: {
      "/ws": { target: "ws://localhost:8787", ws: true },
      "/health": { target: "http://localhost:8787" },
    },
  },
});
