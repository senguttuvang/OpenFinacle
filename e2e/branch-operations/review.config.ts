import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "branch-review.preview.spec.ts",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3060",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  reporter: [["list"]],
});
