import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /retail-navigation\.(?:preview|workspace)\.spec\.ts/,
  outputDir: "test-results/retail-navigation",
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3098",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "off",
  },
  reporter: [["list"]],
});
