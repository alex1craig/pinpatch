import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

export default defineConfig({
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
    process: JSON.stringify({ env: { NODE_ENV: "production" } })
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/entry.tsx"),
      name: "PinpatchOverlay",
      formats: ["iife"],
      fileName: () => "pinpatch-overlay.iife.js"
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true
  }
});
