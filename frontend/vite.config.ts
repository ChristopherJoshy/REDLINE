import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"]
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget(),
        changeOrigin: true,
      },
      "/ws": {
        target: wsTarget(),
        ws: true,
        changeOrigin: true,
      },
    },
  },
});

function apiTarget(): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const envUrl = g.process?.env?.["VITE_API_URL"] || g.process?.env?.["VITE_SERVER_URL"];
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.trim().replace(/\/+$/, "");
  }
  const port = g.process?.env?.["REDLINE_API_PORT"] ?? "3001";
  return `http://127.0.0.1:${port}`;
}

function wsTarget(): string {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const envWs = g.process?.env?.["VITE_WS_URL"];
  if (envWs && envWs.trim() !== "") {
    return envWs.trim();
  }
  const target = apiTarget();
  try {
    const u = new URL(target);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}`;
  } catch {
    return "ws://127.0.0.1:3001";
  }
}
