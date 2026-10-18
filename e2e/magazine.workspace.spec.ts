import { expect, test } from "@playwright/test";
import { chooseOption } from "./fixtures/form-select";

test("magazine leads with capabilities, one bounded comparison, real inner stories and late original journeys", async ({
  page,
}) => {
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET")
      writes.push(new URL(route.request().url()).pathname);
    const path = new URL(route.request().url()).pathname;
    return path === "/api/customers"
      ? route.fulfill({ json: { customers: [] } })
      : path === "/api/telemetry-config"
        ? route.fulfill({ json: { release: "fixture" } })
        : route.fulfill({
            status: 401,
            json: { error: "No session", uncertain: false },
          });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Banking, seen from both sides." }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(8);
  await expect(page.locator(".magazine")).not.toContainText(
    /342 tests|verification|validation|proof ledger|evidence checkpoint/i,
  );
  await expect(
    page.getByRole("button", {
      name: "Explore existing customer",
      exact: true,
    }),
  ).not.toBeInViewport();
  await page.getByRole("button", { name: "Branch team", exact: true }).click();
  await expect(page.locator(".magazine-view-switch img")).toHaveAttribute(
    "src",
    "/product/branch.webp",
  );
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await expect(page.locator(".magazine-view-switch img")).toHaveAttribute(
    "src",
    "/product/statements.webp",
  );
  for (const href of ["/capabilities", "/roadmap", "/build-story"]) {
    const response = await page.request.get(href);
    expect(response.status()).toBe(200);
  }
  await page.goto("/discover");
  await page.locator("#demo-entry a").click();
  await expect(
    page.getByRole("button", {
      name: "Explore existing customer",
      exact: true,
    }),
  ).toBeInViewport();
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
  await expect(
    page.getByRole("button", {
      name: "Start your banking story · Shared branch demo",
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open my first account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/open-account\/?$/);
  expect(writes).toEqual([]);
});

test("build recipe models team pay, AI choices, scope and explicit-value assumptions without banking calls", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/**", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/discover");
  const recipe = page.getByRole("complementary", { name: "Your build recipe" });
  await expect(recipe).toContainText("₹16,80,000");
  await expect(recipe).toContainText("US$2,840");
  await expect(recipe).toContainText("2–4 months");
  await page
    .getByRole("button", { name: "Mostly interns", exact: true })
    .click();
  await expect(recipe).toContainText("7 people");
  await expect(recipe).toContainText("₹16,50,000");
  await page
    .getByRole("button", { name: "Mixed talents", exact: true })
    .click();
  await page.getByRole("button", { name: "Ambition", exact: true }).click();
  await chooseOption(
    page,
    page.getByRole("combobox", {
      name: "Starting point & maturity",
      exact: true,
    }),
    "core",
  );
  await expect(recipe).toContainText("Needs a scoped discovery");
  await chooseOption(
    page,
    page.getByRole("combobox", {
      name: "Starting point & maturity",
      exact: true,
    }),
    "rebuild",
  );
  await page
    .getByRole("button", { name: "AI & approach", exact: true })
    .click();
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "AI model", exact: true }),
    "opus",
  );
  await expect(recipe).toContainText("US$5,680");
  await page.getByRole("button", { name: "Low", exact: true }).click();
  await expect(recipe).toContainText("US$3,890");
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  await page
    .getByRole("button", { name: "AI-first / native", exact: true })
    .click();
  await expect(
    page.getByLabel("Drafting tasks assigned AI assistance", { exact: false }),
  ).toHaveValue("75");
  await recipe.locator(".recipe-ownership summary").click();
  await expect(recipe).toContainText("People own the outcome");
  await page.getByRole("button", { name: "Impact & ROI", exact: true }).click();
  await page
    .getByLabel("Expected monthly benefit · INR", { exact: true })
    .fill("500000");
  await page
    .getByLabel("Additional monthly running cost · INR", { exact: true })
    .fill("100000");
  await expect(recipe).not.toContainText("Illustrative 12-month ROI");
  await page
    .getByLabel("Your exchange-rate assumption · INR per USD", { exact: true })
    .fill("85");
  await expect(recipe).toContainText("₹21,62,800");
  await expect(recipe).toContainText("122%");
  await expect(recipe).toContainText("5.4 months");
  await page
    .getByLabel("Additional monthly running cost · INR", { exact: true })
    .fill("600000");
  await expect(recipe).toContainText("No positive payback");
  await page
    .getByLabel("Your exchange-rate assumption · INR per USD", { exact: true })
    .fill("1001");
  await expect(page.locator("#recipe-fx-error")).toBeVisible();
  await expect(recipe).toContainText("₹21,62,800");
  expect(requests).toBe(0);
});

test("magazine and estimator reflow with enlarged text, keyboard table scrolling and reduced motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/discover");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".magazine-cover-screen")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.screenshot({
    path: "test-results/magazine-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 720, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const size of ["100%", "200%"]) {
      await page.evaluate((value) => {
        document.documentElement.style.fontSize = value;
      }, size);
      for (const step of [
        "People",
        "Ambition",
        "AI & approach",
        "Impact & ROI",
      ]) {
        await page.getByRole("button", { name: step, exact: true }).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${width}/${size}/${step}`,
        ).toBe(true);
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  const table = page.getByRole("region", {
    name: "Scrollable eight-area comparison",
  });
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page
    .locator("#imagine")
    .screenshot({ path: "test-results/magazine-estimator-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
