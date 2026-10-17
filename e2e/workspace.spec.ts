import { expect, test } from "@playwright/test";
import type { Dashboard } from "../src/domain/view";

test("branch queues reflect records, filter before display and stay usable on mobile", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  data.commands = ["pending", "uncertain"].map((status, index) => ({
    id: `instruction-${index}`,
    bank_id: data.bank.id,
    key: `key-${index}`,
    kind: "deposit",
    status: status as "pending" | "uncertain",
    amount_minor: 250000,
    description: index
      ? "Cash receipt requires reconciliation"
      : "Cash deposit for review",
    maker: "officer",
    approver: null,
    core_id: null,
    account_id: 1,
    payload: "{}",
    error: null,
    created_at: "2026-10-17 09:00:00",
  }));
  data.requests = [
    {
      id: "service-001",
      bank_id: data.bank.id,
      kind: "chequebook",
      detail: "Sample chequebook request",
      status: "open",
      created_at: "2026-10-17",
    },
  ];
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
  await expect(
    page.getByRole("button", { name: /Awaiting authorization/ }),
  ).toContainText("01");
  await expect(page.getByRole("button", { name: /Exceptions/ })).toContainText(
    "01",
  );
  await expect(
    page.getByRole("button", { name: /Needs attention/ }),
  ).toContainText("3");
  await expect(page.getByText(/An outcome needs reconciliation/)).toBeVisible();
  await page.getByLabel("Search work queue").fill("receipt");
  await expect(page.locator(".branch-table tbody tr")).toHaveCount(1);
  await page.getByLabel("Search work queue").fill("no such item");
  await expect(
    page.getByRole("heading", { name: "No matching work items" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".branch-table tbody tr")).toHaveCount(3);
  await page.screenshot({
    path: "test-results/branch-workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Work queue" })).toBeVisible();
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    containers: [
      ...document.querySelectorAll(
        ".branch-queue,.table-scroll,.branch-primary,body,nextjs-portal",
      ),
    ].map((element) => ({
      name: element.tagName + "." + element.className,
      overflow: getComputedStyle(element).overflow,
      width: element.getBoundingClientRect().width,
      scroll: element.scrollWidth,
      position: getComputedStyle(element).position,
    })),
    overflowing: [
      ...document.querySelectorAll(
        "body,main,section,aside,nav,header,footer,div,fieldset,button,table,span,p",
      ),
    ]
      .filter(
        (element) => element.getBoundingClientRect().right > innerWidth + 1,
      )
      .map((element) => ({
        className: element.className,
        width: Math.round(element.getBoundingClientRect().width),
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .slice(-15),
  }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(
    layout.viewport,
  );
  await page.screenshot({
    path: "test-results/branch-workspace-mobile.png",
    fullPage: true,
  });
  expect(mutations).toEqual([]);
});

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

test("customer balances and navigation remain usable with local fonts on desktop and mobile", async ({
  page,
}) => {
  const data = savedWorkspace();
  if (data.account)
    data.account.transactions = [
      {
        id: 1,
        date: [2026, 10, 15],
        amount: 100000,
        runningBalance: 100000,
        transactionType: { value: "Opening deposit", deposit: true },
      },
      {
        id: 2,
        date: [2026, 10, 16],
        amount: 20000,
        runningBalance: 120000,
        transactionType: { value: "Salary credit", deposit: true },
      },
    ];
  const externalFonts: string[] = [];
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(request.url()))
      externalFonts.push(request.url());
  });
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
  await expect(page.getByTestId("balance")).toHaveText("₹1,20,000.00");
  await page.getByRole("button", { name: "Hide balances" }).click();
  await expect(page.getByTestId("balance")).toHaveText("₹ ••••••");
  await page.getByRole("button", { name: "Show balances" }).click();
  await page.screenshot({
    path: "test-results/customer-workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/customer-workspace-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "My accounts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Everyday Savings", exact: true }),
  ).toBeVisible();
  expect(externalFonts).toEqual([]);
  expect(mutations).toEqual([]);
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
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Close command menu" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
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

test("busy role changes cannot open command navigation", async ({ page }) => {
  const data = savedWorkspace();
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session/role") {
      await pending;
      data.role = "officer";
    }
    await route.fulfill({ json: path === "/api/dashboard" ? data : {} });
  });
  await page.goto("/");
  await page.getByLabel("Demo persona").selectOption("officer");
  const trigger = page.getByRole("button", { name: /Find a screen/ });
  await expect(trigger).toBeDisabled();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  release();
  await expect(trigger).toBeEnabled();
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
