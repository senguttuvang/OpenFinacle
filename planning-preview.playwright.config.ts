import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /planning-(?:persistence|restart)\.preview\.spec\.ts/,
  outputDir: "test-results/planning-server",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8795",
    headless: true,
    actionTimeout: 10000,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
  },
  reporter: [["list"]],
});
