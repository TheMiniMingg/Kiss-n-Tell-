import { defineConfig, devices } from "@playwright/test";

const PORT = 4175;

/**
 * Runs the desktop frontend in plain Chromium. Outside Tauri the app stores
 * packs in IndexedDB, so the whole editor can be tested without the native shell.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: "off",
    viewport: { width: 1280, height: 820 },
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 820 } } }],
  webServer: {
    // Serves the production build (`pnpm test:e2e:desktop` at the root builds it first).
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
