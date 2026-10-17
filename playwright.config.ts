import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 600000,
  expect: { timeout: 60000 },
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "https://openfinacle.plts.in",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "experience",
      testMatch: /workspace-live\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "workspace",
      testMatch: /workspace\.spec\.ts/,
      expect: { timeout: 10000 },
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "entry",
      testMatch: /(?:persistent-entry|readiness)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "chromium",
      testMatch: /(?:everyday|existing-customer)\.spec\.ts/,
      dependencies: ["entry"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});
