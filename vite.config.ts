import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
    watch: { ignored: ["**/src-tauri/**", "**/.local/**"] },
  },
  build: { target: "es2022" },
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString("en-CA")),
  },
  // The PDF engine loads only when a PDF is imported; prepare it up front so
  // the development server does not reload the page on first use.
  optimizeDeps: { include: ["pdfjs-dist"] },
});
