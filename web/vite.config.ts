import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiProxyTarget = process.env.API_PROXY_TARGET || "http://localhost:5000";
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
    },
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
