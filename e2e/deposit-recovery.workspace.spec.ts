import { expect, test } from "@playwright/test";
import { openWorkspace } from "./fixtures/navigation";
import { savedWorkspace } from "./fixtures/workspace";

test("storage write failure blocks deposit POST and preserves the reviewed form", async ({
  page,
}) => {
  const data = savedWorkspace();
  let posts = 0;
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:deposit-command:"))
        throw new Error("Injected storage failure");
      return original.call(this, key, value);
    };
  });
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/deposits") && request.method() === "POST")
      posts++;
    return route.fulfill({
      json:
        path === "/api/dashboard"
          ? data
          : path === "/api/deposits"
            ? { deposits: [] }
            : {},
    });
  });
  await page.goto("/demo");
  await openWorkspace(page, "deposits");
  await page.getByRole("button", { name: "Open a demo fixed deposit" }).click();
  await page.getByLabel("Demo allocation (₹)").fill("25000");
  await page
    .getByRole("button", { name: "Review application", exact: true })
    .click();
  await page.getByRole("button", { name: "Submit demo application" }).click();
  await expect(
    page.locator(".deposit-workspace").getByRole("alert"),
  ).toContainText("could not be stored or read");
  await expect(page.locator(".deposit-facts")).toContainText("₹25,000.00");
  expect(posts).toBe(0);
});

test("pending reference remains inspectable when the product list fails", async ({
  page,
}) => {
  const data = savedWorkspace();
  let inspections = 0;
  await page.addInitScript((bankId) => {
    sessionStorage.setItem(
      `openfinacle:deposit-command:${bankId}`,
      JSON.stringify({
        key: "pending-deposit-example",
        role: "customer",
        instruction: {
          kind: "submit",
          input: {
            product: "demo-cumulative",
            amount: 10000,
            months: 12,
            maturity: "return_all",
            nominee: null,
          },
        },
      }),
    );
  }, data.bank.id);
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/deposits") {
      if (url.searchParams.has("key")) {
        inspections++;
        return route.fulfill({
          status: 404,
          json: { error: "No recorded deposit instruction" },
        });
      }
      return route.fulfill({
        status: 503,
        json: { error: "List temporarily unavailable" },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await page.goto("/demo");
  await openWorkspace(page, "deposits");
  await expect(
    page.getByRole("heading", { name: "Check your saved deposit instruction" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check saved instruction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry original instruction" }),
  ).toBeVisible();
  expect(inspections).toBe(1);
  await expect(
    page.getByRole("button", { name: "Open a demo fixed deposit" }),
  ).toBeDisabled();
});
