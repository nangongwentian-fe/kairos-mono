import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { env } from "node:process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const clientRoot = fileURLToPath(new URL("./src/client", import.meta.url));
const clientOutDir = fileURLToPath(new URL("./dist/client", import.meta.url));
const serverHost = env.KAIROS_CODING_WEB_HOST ?? "127.0.0.1";
const serverPort = env.KAIROS_CODING_WEB_PORT ?? "4174";
const clientHost = env.KAIROS_CODING_WEB_CLIENT_HOST ?? "127.0.0.1";
const clientPort = Number(env.KAIROS_CODING_WEB_CLIENT_PORT ?? "4173");

export default defineConfig({
  root: clientRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": clientRoot,
    },
  },
  build: {
    outDir: clientOutDir,
    emptyOutDir: true,
  },
  server: {
    host: clientHost,
    port: clientPort,
    strictPort: true,
    proxy: {
      "/api": {
        target:
          env.KAIROS_CODING_WEB_API_TARGET ??
          `http://${serverHost}:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
});
