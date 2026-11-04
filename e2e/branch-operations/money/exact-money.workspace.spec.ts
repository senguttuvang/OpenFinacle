import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../../fixtures/workspace";

for (const field of ["accountBalance", "totalFeeCharge"])
  test(`fractional-paise native ${field} withholds branch financial figures`, async ({
    page,
  }) => {
    const day = branchDayFixture();
    day.reviewFixture = false;
    const account = day.relationships[0].account;
    if (!account?.summary) throw new Error("Missing fixture account");
    Object.assign(account.summary, { [field]: 1.001 });
    const data = savedWorkspace();
    data.role = "officer";
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json:
          path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
      });
    });
    await page.goto("/overview");
    const workspace = page.locator(".branch-day");
    await expect(workspace.getByRole("alert")).toContainText(
      "incomplete or invalid",
    );
    await expect(
      workspace.getByRole("region", { name: "Registered savings scope" }),
    ).toHaveCount(0);
    await expect(
      workspace.getByRole("heading", {
        name: "Deposits by product",
        exact: true,
      }),
    ).toHaveCount(0);
  });

for (const width of [1440, 390])
  test(`native credit/debit and reversal evidence governs exact branch metrics at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const account = day.relationships[0].account,
      other = day.relationships[1].account;
    if (!account?.summary || !other?.summary)
      throw new Error("Missing fixture accounts");
    account.summary.accountBalance = 12.34;
    other.summary.accountBalance = 0;
    other.savingsProductId = 2;
    account.transactions = [
      {
        id: 1,
        date: [2026, 11, 3],
        amount: 0.1,
        reversed: false,
        entryType: "CREDIT",
        transactionType: { value: "Interest posting" },
      },
      {
        id: 2,
        date: [2026, 11, 3],
        amount: 0.2,
        reversed: false,
        entryType: "CREDIT",
        transactionType: { value: "Other native credit" },
      },
      {
        id: 3,
        date: [2026, 11, 3],
        amount: 1.25,
        reversed: false,
        entryType: "DEBIT",
        transactionType: { value: "Fee deduction" },
      },
    ];
    const data = savedWorkspace();
    data.role = "officer";
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") writes.push(path);
      return route.fulfill({
        json:
          path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
      });
    });
    await page.goto("/overview");
    const workspace = page.locator(".branch-day"),
      metrics = workspace.getByRole("region", {
        name: "Registered savings scope",
      });
    const credit = metrics
        .locator(".branch-metric")
        .filter({ hasText: "Today’s account credits" })
        .locator("strong"),
      debit = metrics
        .locator(".branch-metric")
        .filter({ hasText: "Today’s account debits" })
        .locator("strong");
    await expect(credit).toHaveText("₹0.30");
    await expect(debit).toHaveText("₹1.25");
    await expect(
      workspace.getByText("Everyday Savings · Core product 1:", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      workspace.getByText("Everyday Savings · Core product 2:", {
        exact: false,
      }),
    ).toBeVisible();
    if (width === 390) {
      const before = await credit.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      );
      await page.evaluate(() => {
        const root = document.documentElement;
        root.style.fontSize = `${Number.parseFloat(getComputedStyle(root).fontSize) * 2}px`;
      });
      const after = await credit.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).fontSize),
      );
      expect(after).toBeCloseTo(before * 2, 1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    account.transactions[0].entryType = null;
    await workspace
      .getByRole("button", { name: "Refresh branch records", exact: true })
      .click();
    await expect(credit).toHaveText("Incomplete");
    await expect(debit).toHaveText("Incomplete");
    account.transactions[0].reversed = true;
    await workspace
      .getByRole("button", { name: "Refresh branch records", exact: true })
      .click();
    await expect(credit).toHaveText("₹0.20");
    await expect(debit).toHaveText("₹1.25");
    expect(writes).toEqual([]);
  });

test("unsafe branch and product sums display incomplete rather than a rounded financial amount", async ({
  page,
}) => {
  const day = branchDayFixture();
  day.reviewFixture = false;
  for (const r of day.relationships) {
    if (!r.account?.summary) throw new Error("Missing fixture account");
    r.account.summary.accountBalance = 60000000000000;
  }
  const data = savedWorkspace();
  data.role = "officer";
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
    });
  });
  await page.goto("/overview");
  const workspace = page.locator(".branch-day"),
    metrics = workspace.getByRole("region", {
      name: "Registered savings scope",
    });
  await expect(
    metrics.locator(".branch-metric strong").filter({ hasText: "Incomplete" }),
  ).toHaveCount(3);
  await expect(
    workspace.getByText(
      "Totals withheld until every registered account has complete INR evidence, a native product ID and safe monetary subtotals.",
      { exact: true },
    ),
  ).toBeVisible();
});
