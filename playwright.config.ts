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
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});
