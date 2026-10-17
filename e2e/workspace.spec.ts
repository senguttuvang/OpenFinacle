import { expect, test } from "@playwright/test";
import type { Dashboard } from "../src/domain/view";

const savedWorkspace = (): Dashboard => ({
  bank: {
    id: "synthetic-workspace",
    created_at: "2026-10-17",
    journey: "existing",
  },
  role: "customer",
  account: {
    id: 1,
    accountNo: "DEMO-001",
    clientId: 1,
    clientName: "Mira Krishnan",
    status: { id: 300, value: "Active", active: true },
    summary: { accountBalance: 120000, availableBalance: 120000 },
    transactions: [],
  },
  recipient: {
    id: 2,
    accountNo: "DEMO-002",
    clientName: "Arjun Raman",
    summary: { accountBalance: 5000 },
  },
  employer: null,
  application: null,
  beneficiaries: [],
  commands: [],
  audit: [],
  documents: [],
  requests: [],
  core: {
    engine: "Fineract",
    version: "1.15.0",
    connected: false,
    cached: true,
    syncedAt: 1792195200000,
  },
  businessDate: "17 October 2026",
});

test("commands search customer screens, trap focus and return it without banking mutations", async ({
  page,
}) => {
  const data = savedWorkspace();
  const mutations: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") mutations.push(path);
    return route.fulfill({ json: path === "/api/dashboard" ? data : {} });
  });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: /Find a screen/ });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", {
    name: "Navigate banking workspace",
  });
  await expect(dialog).toBeVisible();
  const input = page.getByRole("combobox", { name: "Banking screens" });
  await expect(input).toBeFocused();
  await input.fill("FTI");
  await expect(dialog.getByText(/No matching screen/)).toBeVisible();
  await input.fill("statement");
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Everyday Savings statement" }),
  ).toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(mutations).toEqual([]);
});

test("staff aliases open teller screens; menu navigation never posts an instruction", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const mutations: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET")
      mutations.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/dashboard"
          ? data
          : {},
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Find a screen/ }).click();
  await page.getByRole("combobox", { name: "Banking screens" }).fill("TM");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Cash & salary", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(mutations).toEqual([]);
});
