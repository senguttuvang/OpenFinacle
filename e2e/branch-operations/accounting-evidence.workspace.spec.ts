import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const malformed of [
  "foreign journal currency",
  "invalid error collection",
  "unsupported INR precision",
  "malformed computation flag",
  "contradictory entry label",
]) {
  test(`savings accounting clears ${malformed} before rendering financial evidence`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 950 });
    const day = branchDayFixture(),
      data = savedWorkspace();
    data.role = "officer";
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      if (req.method() !== "GET") writes.push(path);
      const evidence = {
        observedAt: day.observedAt,
        coverage: {
          offset: 0,
          limit: 200,
          sourceRows: 1,
          excludedRows: 0,
          hasMore: false,
        },
        chart: [],
        product: null,
        errors: malformed === "invalid error collection" ? 3 : [],
        journals: {
          totalFilteredRecords: 1,
          pageItems: [
            {
              id: 99991,
              officeId: 1,
              glAccountId: 2,
              glAccountName: "Must not render malformed evidence",
              glAccountCode: "INVALID",
              transactionId: "untrusted-provider-label",
              transactionDate: [2026, 11, 4],
              entryType: {
                id: 1,
                value:
                  malformed === "contradictory entry label"
                    ? "DEBIT"
                    : "CREDIT",
              },
              amount: 125.25,
              runningBalanceComputed:
                malformed === "malformed computation flag" ? "false" : false,
              currency: {
                code: malformed === "foreign journal currency" ? "USD" : "INR",
                decimalPlaces:
                  malformed === "unsupported INR precision" ? 3 : 2,
              },
              entityId: day.relationships[0].customer.account_id,
              entityType: { id: 2, value: "SAVING" },
            },
          ],
        },
      };
      return route.fulfill({
        json:
          path === "/api/dashboard"
            ? data
            : path === "/api/branch"
              ? day
              : path === "/api/branch/accounting"
                ? evidence
                : {},
      });
    });
    await page.goto("/overview");
    const workspace = page.locator(".branch-day");
    await workspace
      .getByRole("navigation", { name: "Branch day screens" })
      .getByRole("button", { name: "Accounting", exact: true })
      .click();
    await expect(
      workspace
        .getByRole("alert")
        .filter({ hasText: "Accounting evidence is unavailable or invalid" }),
    ).toBeVisible();
    await expect(
      workspace.getByText("Must not render malformed evidence", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      workspace.getByText("untrusted-provider-label", { exact: true }),
    ).toHaveCount(0);
    await expect(
      workspace.getByText("Product accounting mapping unavailable.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
}
