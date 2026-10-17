import { expect, test } from "@playwright/test";

test.use({ actionTimeout: 10000 });
test.setTimeout(60000);

test("planning filters reconcile source transactions and preserve saved household scenarios", async ({
  page,
}) => {
  await page.goto("/planning");
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await page.getByLabel("Date range", { exact: true }).selectOption("month");
  await page.getByLabel("Category", { exact: true }).selectOption("Shopping");
  await page.getByLabel("Merchant search").fill("Loom");
  await expect(
    page.getByRole("heading", { name: "Source transactions" }),
  ).toBeVisible();
  const source = page.locator("#planning-transactions");
  await expect(
    source.getByRole("cell", { name: /Synthetic Loom/ }).first(),
  ).toBeVisible();
  await expect(source.getByRole("cell", { name: /Dining/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Scenario lab", exact: true }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page
    .getByLabel("Scenario name", { exact: true })
    .fill("Browser saved education alternative");
  await page
    .getByLabel("Education goal in today's rupees", { exact: false })
    .fill("1800000");
  await page
    .getByRole("button", { name: "Save scenario v1", exact: true })
    .click();
  await expect(page.getByLabel("Saved scenario")).toContainText(
    "Browser saved education alternative",
  );
  await page.reload();
  await page.getByRole("button", { name: "Scenario lab", exact: true }).click();
  await expect(page.getByLabel("Saved scenario")).toContainText(
    "Browser saved education alternative",
  );
  await page
    .getByLabel("Household", { exact: true })
    .selectOption("synthetic-kaveri");
  await expect(page.getByLabel("Saved scenario")).not.toContainText(
    "Browser saved education alternative",
  );
  await page
    .getByLabel("Household", { exact: true })
    .selectOption("synthetic-nila");
  await page
    .getByLabel("Saved scenario")
    .selectOption({ label: "Browser saved education alternative · v1" });
  await page
    .getByRole("button", { name: "Edit assumptions", exact: true })
    .click();
  await expect(
    page.getByLabel("Education goal in today's rupees", { exact: false }),
  ).toHaveValue("1800000");
  await page.getByRole("button", { name: "Cancel edits" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByLabel("Saved scenario")).not.toContainText(
    "Browser saved education alternative",
  );
});

test("budgets and acknowledgments survive reload, desktop and large-text mobile remain contained", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/planning");
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await page.getByLabel("Date range", { exact: true }).selectOption("month");
  await page.getByLabel("Category", { exact: true }).selectOption("Dining");
  await page.getByLabel("Dining monthly budget INR").fill("100");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Over budget", { exact: false }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Cash flow", exact: true }).click();
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("100");
  await page.getByRole("button", { name: /^Insights/ }).click();
  const insight = page
    .locator(".wp-insight")
    .filter({ hasText: "Provident fund valuation needs a refresh" });
  await insight
    .getByRole("button", { name: "Acknowledge", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: /^Insights/ }).click();
  await expect(
    insight.getByRole("button", { name: "Reopen insight" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("planning-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Extra-large text" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reading", "large");
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
  await page.getByLabel("Household", { exact: true }).focus();
  await expect(page.getByLabel("Household", { exact: true })).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("planning-mobile-large.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
