import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

for (const width of [1440, 390]) {
  test(`branch work filters compose and preserve original detail at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const day = branchDayFixture();
    day.reviewFixture = false;
    const [first, second] = day.relationships;
    first.commands[0].status = "uncertain";
    second.commands[0].status = "posted";
    second.commands[0].core_id = 387;
    second.account = null;
    second.error = "Core account unavailable";
    first.requests = [
      {
        id: "delivery-case",
        bank_id: first.customer.bank_id,
        kind: "chequebook",
        status: "fulfilled",
        detail: "Delivery evidence pending",
        created_at: "2026-11-04",
        delivery_status: "awaiting_dispatch",
      },
    ];
    day.responsibilities = [
      {
        command_id: first.commands[0].id,
        owner: "manager",
        version: 1,
        updated_at: "2026-11-04",
      },
    ];
    const data = savedWorkspace();
    data.role = "officer";
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      if (route.request().method() !== "GET")
        writes.push(route.request().url());
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json:
          path === "/api/dashboard" ? data : path === "/api/branch" ? day : {},
      });
    });
    await page.goto("/overview");
    const nav = page.getByRole("navigation", { name: "Branch day screens" });
    await nav.getByRole("button", { name: "Customers", exact: true }).click();
    await page.getByLabel("Customer work filter").selectOption("services");
    await expect(
      page.getByRole("button", { name: "Open customer 360", exact: true }),
    ).toHaveCount(1);
    await page
      .getByLabel("Search name, reference or account")
      .fill("Northstar");
    await expect(
      page.getByText("No matching registered relationships.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Clear customer filters", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open customer 360", exact: true }),
    ).toHaveCount(2);
    await page.getByLabel("Customer work filter").selectOption("core");
    await expect(
      page.getByRole("row").filter({ hasText: "Northstar Trading" }),
    ).toBeVisible();
    await page.getByLabel("Savings product filter").selectOption("1");
    await expect(
      page.getByRole("button", { name: "Open customer 360", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Clear customer filters", exact: true })
      .click();
    await page
      .getByRole("button", { name: "1 unresolved instructions", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: "Mira Krishnan · instruction-0",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Instruction owner filter")
      .selectOption("unassigned");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "selected original instruction is outside" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Approve original instruction",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(page.getByLabel("Instruction customer filter")).toHaveValue(
      "customer-0",
    );
    await page.getByLabel("Instruction customer filter").selectOption("");
    await page.getByLabel("Instruction owner filter").selectOption("all");
    await page.getByLabel("Instruction state filter").selectOption("posted");
    await page
      .getByLabel("Search instructions, customer or Core reference")
      .fill("387");
    await page
      .getByRole("button", {
        name: "Northstar Trading · deposit · posted · instruction-1",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Northstar Trading · instruction-1",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reset instruction filters", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Mira Krishnan · deposit · uncertain · instruction-0",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "selected original instruction is outside" }),
    ).toBeVisible();
    await page.locator(".branch-day").evaluate((el) => {
      (el as HTMLElement).style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await nav
      .getByRole("button", { name: "Daily control", exact: true })
      .click();
    await expect(
      page.getByText("Close readiness · blocked", { exact: true }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
}
