import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "comparison.preview.spec.ts",
  projects: [
    { name: "preview" },
    { name: "integrated" },
    {
      name: "magazine-regression",
      testDir: "..",
      testMatch: "magazine.workspace.spec.ts",
    },
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:8810", headless: true },
});
