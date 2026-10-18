import { expect, test } from "@playwright/test";
import type { CardCommand, CardDetail } from "../src/domain/cards";
import { openWorkspace } from "./fixtures/navigation";
import { choosePersona } from "./fixtures/persona";
import { savedWorkspace } from "./fixtures/workspace";

test("persona select supports keyboard, cancellation, typeahead and large mobile options", async ({
  page,
}) => {
  const data = savedWorkspace();
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes.push(path);
    if (path === "/api/session/role")
      data.role = route.request().postDataJSON().role;
    return route.fulfill({ json: path === "/api/dashboard" ? data : {} });
  });
  await page.goto("/");
  const trigger = page.getByRole("combobox", { name: "Demo persona" });
  await trigger.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(
    page.getByRole("option", { name: "Customer", exact: true }),
  ).toHaveAttribute("data-state", "checked");
  await page.screenshot({
    path: "test-results/persona-desktop.png",
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(writes).toEqual([]);
  await trigger.click();
  await page.keyboard.type("Approver");
  await expect(
    page.getByRole("option", { name: "Approver", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("Approver");
  await expect(trigger).toBeEnabled();
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const option = await page
    .getByRole("option", { name: "Bank officer", exact: true })
    .boundingBox();
  expect(option?.height).toBeGreaterThanOrEqual(50);
  expect(option?.x).toBeGreaterThanOrEqual(0);
  expect((option?.x ?? 0) + (option?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/persona-mobile.png",
  });
  await page.getByRole("option", { name: "Bank officer", exact: true }).click();
  await expect(trigger).toHaveText("Bank officer");
  expect(writes).toEqual(["/api/session/role", "/api/session/role"]);
});

test("reading size persists across reload and role navigation without financial writes", async ({
  page,
}) => {
  const data = savedWorkspace();
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/session/role")
      data.role = route.request().postDataJSON().role;
    else if (route.request().method() !== "GET") writes.push(path);
    return route.fulfill({ json: path === "/api/dashboard" ? data : {} });
  });
  await page.goto("/");
  const reading = page.getByRole("button", {
    name: "Extra-large text",
    exact: true,
  });
  await expect(reading).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.body).fontSize),
    ),
  ).toBeGreaterThanOrEqual(18);
  await reading.click();
  await page.reload();
  await expect(reading).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.body).fontSize),
    ),
  ).toBeGreaterThanOrEqual(22);
  await choosePersona(page, "officer");
  await expect(
    page.getByRole("heading", { name: "Branch overview", exact: true }),
  ).toBeVisible();
  await expect(reading).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await reading.click();
  await page.reload();
  await expect(reading).toHaveAttribute("aria-pressed", "false");
  expect(writes).toEqual([]);
});

test("card controls review, recover a lost response after reload and share staff history", async ({
  page,
}) => {
  const data = savedWorkspace();
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  let detail: CardDetail = {
    card: {
      id: "synthetic-debit",
      bank_id: data.bank.id,
      suffix: "4242",
      status: "active",
      settings: {
        atm: true,
        pos: true,
        online: false,
        contactless: false,
        international: false,
        daily_limit: 25000,
      },
      version: 0,
      updated_at: "2026-10-17",
    },
    history: [],
    actions: ["settings", "hold", "block"],
    confirmed_key: null,
  };
  let lose = false;
  let writes = 0;
  const keys = new Set<string>();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (url.pathname === "/api/cards/action") {
      const input = request.postDataJSON() as CardCommand;
      const key = request.headers()["idempotency-key"];
      keys.add(key);
      writes++;
      detail = {
        ...detail,
        confirmed_key: key,
        card: {
          ...detail.card,
          version: detail.card.version + 1,
          status:
            input.action === "hold"
              ? "held"
              : input.action === "block"
                ? "blocked"
                : "active",
          settings: input.settings ?? detail.card.settings,
        },
      };
      detail = {
        ...detail,
        history: [
          ...detail.history,
          {
            id: `event-${writes}`,
            card_id: detail.card.id,
            actor: data.role,
            action: input.action,
            note: input.note,
            status: detail.card.status,
            settings: detail.card.settings,
            version: detail.card.version,
            created_at: "2026-10-17",
          },
        ],
      };
      if (lose) {
        lose = false;
        return route.abort();
      }
      return route.fulfill({ json: detail });
    }
    if (url.pathname === "/api/cards") {
      if (!url.searchParams.has("id") && !url.searchParams.has("key"))
        return route.fulfill({ json: { cards: [detail.card] } });
      if (
        url.searchParams.has("key") &&
        !keys.has(url.searchParams.get("key") ?? "")
      )
        return route.fulfill({
          status: 404,
          json: { error: "No saved card command" },
        });
      const actions =
        detail.card.status === "blocked"
          ? []
          : data.role === "officer"
            ? ["block"]
            : detail.card.status === "held"
              ? ["resume", "block"]
              : ["settings", "hold", "block"];
      return route.fulfill({ json: { ...detail, actions } });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await page.goto("/");
  await openWorkspace(page, "cards");
  await expect(
    page.getByRole("heading", { name: "My debit card" }),
  ).toBeVisible();
  await button("Change controls").click();
  await page.getByLabel("Online payments", { exact: true }).check();
  await page.getByLabel("Daily limit (₹)").fill("50000");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Enable synthetic online shopping");
  await button("Review change").click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Edit change", exact: true }).click();
  await expect(
    page.getByLabel("Online payments", { exact: true }),
  ).toBeChecked();
  await button("Review change").click();
  await button("Confirm card change").click();
  await expect(page.getByRole("status")).toContainText("Card change recorded");
  expect(detail.card.settings.online).toBe(true);
  expect(detail.card.settings.daily_limit).toBe(50000);
  lose = true;
  await button("Temporarily hold").click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic card temporarily misplaced");
  await button("Review change").click();
  await button("Confirm card change").click();
  await expect(
    page.locator(".card-workspace").getByRole("alert"),
  ).toBeVisible();
  await page.reload();
  await openWorkspace(page, "cards");
  await expect(
    page.getByRole("button", { name: "Check saved command" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume card", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check saved command" }).click();
  await expect(page.getByRole("status")).toContainText("Card change recorded");
  expect(writes).toBe(2);
  await expect(
    page.getByRole("heading", { name: "Temporarily held", exact: true }),
  ).toBeVisible();
  await choosePersona(page, "officer");
  await openWorkspace(page, "cards");
  await expect(
    page.getByRole("heading", { name: "Customer card enquiry" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Resume card", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".card-history li")).toHaveCount(2);
  await button("Permanently block").click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic lost card security report");
  await button("Review change").click();
  await page.getByRole("button", { name: "Confirm permanent block" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep card", exact: true }).click();
  expect(writes).toBe(2);
  await page.getByRole("button", { name: "Confirm permanent block" }).click();
  await button("Block card permanently").click();
  await expect(
    page.getByRole("heading", { name: "Permanently blocked", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".card-history li")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

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
  await openWorkspace(page, "accounts");
  await expect(
    page.getByRole("heading", { name: "Everyday Savings", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/account-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.screenshot({
    path: "test-results/account-user-1700.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Extra-large text", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/account-extra-large-mobile.png",
    fullPage: true,
  });
  const identity = await page.locator(".account-identity h2").boundingBox();
  expect(identity?.width).toBeGreaterThanOrEqual(150);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 900, height: 1000 });
  expect(
    await page
      .locator("main.content")
      .evaluate((element) => element.getBoundingClientRect().left),
  ).toBeLessThan(50);
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
  await choosePersona(page, "officer");
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
