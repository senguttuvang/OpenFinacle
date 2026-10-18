import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "core-variants.spec.ts",
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8810", headless: true },
});
