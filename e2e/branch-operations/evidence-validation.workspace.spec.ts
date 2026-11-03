import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const source of ["calendar", "delivery"] as const) {
  test(`invalid ${source} evidence withholds branch figures and controls`, async ({
    page,
  }) => {
    const data = savedWorkspace();
    data.role = "officer";
    const day = branchDayFixture();
    day.reviewFixture = false;
    const relationship = day.relationships[0];
    if (source === "calendar") {
      if (!relationship.account) throw new Error("Missing fixture account");
      relationship.account.transactions = [
        {
          id: 999,
          date: [2025, 2, 29],
          amount: 100,
          transactionType: { value: "Deposit", deposit: true },
        },
      ];
    }
    const response =
      source === "delivery"
        ? {
            ...day,
            relationships: [
              {
                ...relationship,
                requests: [
                  {
                    id: "invalid-case",
                    kind: "chequebook",
                    status: "fulfilled",
                    detail: "Malformed metadata",
                    delivery_status: { not_text: true },
                  },
                ],
              },
            ],
          }
        : day;
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json:
          path === "/api/dashboard"
            ? data
            : path === "/api/branch"
              ? response
              : {},
      });
    });
    await page.goto("/overview");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Branch response is incomplete or invalid" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Deposits by product", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Submit for independent approval",
        exact: true,
      }),
    ).toHaveCount(0);
  });
}
