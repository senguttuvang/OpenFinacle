import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

test("daily control exposes open cases and outstanding delivery with owned customer drill-down", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const day = branchDayFixture();
  day.reviewFixture = false;
  const relationship = day.relationships[0];
  relationship.requests = [
    {
      id: "awaiting-case",
      bank_id: relationship.customer.bank_id,
      kind: "email_change",
      detail: "Synthetic request awaits checker",
      status: "awaiting_approval",
      created_at: "2026-11-04",
    },
    {
      id: "delivery-case",
      bank_id: relationship.customer.bank_id,
      kind: "chequebook",
      detail: "Synthetic cheque dispatch outstanding",
      status: "fulfilled",
      delivery_status: "dispatched",
      updated_by: "officer",
      created_at: "2026-11-04",
    },
    {
      id: "complete-case",
      bank_id: relationship.customer.bank_id,
      kind: "email_change",
      detail: "Synthetic no-delivery completion",
      status: "fulfilled",
      delivery_status: "none",
      created_at: "2026-11-04",
    },
  ];
  for (const other of day.relationships.slice(1)) other.requests = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json:
        path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
    });
  });
  await page.goto("/overview");
  const nav = page.getByRole("navigation", { name: "Branch day screens" });
  await nav.getByRole("button", { name: "Daily control", exact: true }).click();
  await expect(
    page.getByText("Synthetic request awaits checker", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Delivery exception: Dispatched", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic no-delivery completion", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Close readiness · blocked", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /SR-.*chequebook/ }).click();
  const history = page.getByRole("region", {
    name: "Customer service history",
  });
  await expect(history).toBeVisible();
  await expect(
    history.getByText("Synthetic cheque dispatch outstanding", {
      exact: false,
    }),
  ).toBeVisible();
});
