import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const clientRoot = fileURLToPath(new URL("./src/client", import.meta.url));
const clientOutDir = fileURLToPath(new URL("./dist/client", import.meta.url));

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
});
