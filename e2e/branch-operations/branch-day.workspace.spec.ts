import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390])
  test(`six connected branch screens at ${width}px with explicit source and control gaps`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data = savedWorkspace();
    data.role = "officer";
    data.businessDate = "2026-11-03";
    const day = branchDayFixture();
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
      if (path === "/api/dashboard") return route.fulfill({ json: data });
      if (path === "/api/branch") return route.fulfill({ json: day });
      if (path === "/api/branch/accounting")
        return route.fulfill({
          json: {
            coverage: {
              offset: 0,
              limit: 200,
              sourceRows: 0,
              excludedRows: 0,
              hasMore: false,
            },
            observedAt: day.observedAt,
            chart: [{ id: 2, name: "Customer deposits", glCode: "OF2001" }],
            product: {
              id: 1,
              name: "Everyday Savings",
              accountingRule: { id: 2, value: "Cash based" },
              accountingMappings: {
                savingsControlAccount: { id: 2, name: "Customer deposits" },
              },
            },
            journals: { totalFilteredRecords: 0, pageItems: [] },
            errors: [],
          },
        });
      if (path === "/api/branch/assign") {
        const body = route.request().postDataJSON();
        day.responsibilities.push({
          command_id: body.commandId,
          owner: body.owner,
          version: 1,
          updated_at: "2026-11-03 11:00:00",
        });
        return route.fulfill({ json: day.responsibilities.at(-1) });
      }
      return route.fulfill({
        status: 404,
        json: { error: "Outside branch UI fixture" },
      });
    });
    await page.goto("/overview");
    const workspace = page.locator(".branch-day");
    await expect(
      workspace.getByRole("heading", { name: "One branch day" }),
    ).toBeVisible();
    await expect(
      workspace.getByText("Registered INR savings ledger"),
    ).toBeVisible();
    const tabs = workspace.getByRole("navigation", {
      name: "Branch day screens",
    });
    await tabs.getByRole("button", { name: "Customers", exact: true }).click();
    await workspace
      .getByRole("textbox", { name: "Search name, reference or account" })
      .fill("Northstar");
    await expect(
      workspace.getByRole("cell", { name: /Northstar Trading/ }),
    ).toBeVisible();
    await expect(
      workspace.getByRole("cell", { name: /Mira Krishnan/ }),
    ).toHaveCount(0);
    await workspace.getByRole("button", { name: "Open customer 360" }).click();
    await expect(
      workspace.getByRole("heading", { name: "Northstar Trading" }),
    ).toBeVisible();
    await expect(
      workspace.getByText("Not returned by core", { exact: true }).first(),
    ).toBeVisible();
    await workspace
      .getByRole("button", { name: /instruction-1 · deposit/ })
      .click();
    await expect(
      workspace.getByRole("button", { name: "Approve original instruction" }),
    ).toBeDisabled();
    await workspace
      .getByRole("button", { name: "Inspect core journals" })
      .click();
    await expect(
      workspace.getByRole("heading", { name: "Accounting explorer" }),
    ).toBeVisible();
    await expect(workspace.getByText(/No journal rows returned/)).toBeVisible();
    await tabs
      .getByRole("button", { name: "Daily control", exact: true })
      .click();
    await expect(
      workspace.getByText("Close readiness · blocked", { exact: true }),
    ).toBeVisible();
    await workspace
      .getByLabel("Owner for instruction-1")
      .selectOption("accountant");
    await expect(workspace.getByLabel("Owner for instruction-1")).toHaveValue(
      "accountant",
    );
    expect(writes).toEqual(["/api/branch/assign"]);
    await tabs.getByRole("button", { name: "Overview", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      workspace.getByText("Deposits by product", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      tabs.getByRole("button", { name: "Overview", exact: true }),
    ).toHaveCSS("background-color", "rgb(23, 61, 134)");
    await page.screenshot({
      path: `test-results/branch-day-${width}.png`,
      fullPage: true,
    });
  });
test("accounting pages preserve selected relationship scope and expose provider coverage", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const day = branchDayFixture();
  const offsets: number[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/telemetry-config")
      return route.fulfill({ json: {} });
    if (url.pathname === "/api/branch") return route.fulfill({ json: day });
    if (url.pathname === "/api/branch/accounting") {
      expect(url.searchParams.get("customerId")).toBe(
        day.relationships[0].customer.id,
      );
      const offset = Number(url.searchParams.get("offset") ?? "0");
      offsets.push(offset);
      const count = offset === 0 ? 200 : 1;
      return route.fulfill({
        json: {
          observedAt: day.observedAt,
          chart: [],
          product: null,
          errors: [],
          coverage: {
            offset,
            limit: 200,
            sourceRows: count,
            excludedRows: 0,
            hasMore: offset === 0,
          },
          journals: {
            totalFilteredRecords: 201,
            pageItems: Array.from({ length: count }, (_, i) => ({
              id: offset + i + 1,
              officeId: 1,
              glAccountId: 2,
              glAccountCode: "OF2001",
              glAccountName: "Deposits",
              transactionId: `S${offset + i + 1}`,
              transactionDate: [2026, 11, 3],
              entryType: { id: 1, value: "CREDIT" },
              amount: 1,
              currency: { code: "INR", decimalPlaces: 2 },
              entityId: day.relationships[0].customer.account_id,
              entityType: { id: 2, value: "SAVING" },
            })),
          },
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Outside pagination fixture" },
    });
  });
  await page.goto("/overview");
  const workspace = page.locator(".branch-day");
  await workspace
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Accounting", exact: true })
    .click();
  await expect(workspace.locator("tbody tr")).toHaveCount(200);
  await expect(
    workspace
      .getByText("Native running-balance flag: Not returned", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(workspace).toContainText(
    "Stored running-balance amounts are withheld",
  );
  await expect(
    workspace.getByRole("button", { name: "Previous journal page" }),
  ).toBeDisabled();
  await workspace.getByRole("button", { name: "Next journal page" }).click();
  await expect(workspace.locator("tbody tr")).toHaveCount(1);
  await expect(
    workspace.getByRole("button", { name: "Next journal page" }),
  ).toBeDisabled();
  await workspace
    .getByRole("button", { name: "Previous journal page" })
    .click();
  await expect(workspace.locator("tbody tr")).toHaveCount(200);
  expect(offsets).toEqual([0, 200, 0]);
});
