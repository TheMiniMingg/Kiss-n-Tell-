import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed port in dev and loads the built files from dist/.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // Reuse the web app's public folder: favicon and the built preset content (pnpm content:build).
  publicDir: "../web/public",
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  preview: { port: 4175, strictPort: true },
  build: {
    // WebView2 (Windows) and WKWebView on macOS 11+ both handle ES2021.
    target: ["es2021", "chrome105", "safari14"],
    outDir: "dist",
    emptyOutDir: true,
  },
});
