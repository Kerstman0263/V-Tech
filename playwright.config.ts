import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", fullyParallel: false, workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  timeout: 90_000, expect: { timeout: 15_000 },
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", locale: "nl-NL" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node scripts/test-server.mjs", url: "http://localhost:3100/login",
    timeout: 180_000, reuseExistingServer: false,
  },
});
