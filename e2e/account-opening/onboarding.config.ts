import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: /onboarding\.workspace\.spec\.ts/,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3096",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
