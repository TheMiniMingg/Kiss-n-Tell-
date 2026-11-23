import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the build works from any folder or host.
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
});
