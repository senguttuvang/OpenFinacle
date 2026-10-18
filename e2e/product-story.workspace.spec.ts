import { expect, test } from "@playwright/test";
import { chooseOption } from "./fixtures/form-select";

test("product page discloses scope, loads actual previews and calculates resources without banking writes", async ({
  page,
}) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/telemetry-config")
      return route.fulfill({ json: { release: "product-fixture" } });
    if (path === "/api/customers")
      return route.fulfill({ json: { customers: [] } });
    return route.fulfill({
      status: 401,
      json: { error: "No session", uncertain: false },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "How far can a banking idea go in a week?",
    }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await page.locator("#capabilities summary").click();
  const checklist = page.getByRole("table", {
    name: /OpenFinacle local retail checklist/,
  });
  await expect(checklist.locator("tbody tr")).toHaveCount(20);
  await expect(page.locator("#capabilities")).toContainText(
    "It is not “50% of Finacle” or “50% production ready.”",
  );
  const calculation = page.locator(".story-calculation");
  await expect(calculation).toContainText("250 person-days");
  await expect(calculation).toContainText("25B tokens");
  await expect(calculation).toContainText("4.0×");
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Developers", exact: true }),
    "10",
  );
  await expect(calculation).toContainText("500 person-days");
  await expect(calculation).toContainText("50B tokens");
  await expect(calculation).toContainText("2.0×");
  for (const image of await page.locator(".story-gallery img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement &&
            element.complete &&
            element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await expect(page.locator(".story-gallery img")).toHaveCount(5);
  await page.screenshot({
    path: "test-results/product-page-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/product-page-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Explore existing customer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Choose an existing customer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to journeys", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open my first account", exact: false })
    .click();
  await expect(page).toHaveURL(/\/open-account\/?$/);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
