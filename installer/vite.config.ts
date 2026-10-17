import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nativeFolder } from "./native-folder.ts";

export default defineConfig({
  plugins: [react(), nativeFolder()],
  base: "./",
  build: { target: "es2022", outDir: "dist" },
});
