import { expect, test } from "@playwright/test";
import { chooseOption } from "../fixtures/form-select";
import { enlargeText } from "../fixtures/text-scale";

test.use({ actionTimeout: 10000 });
test.setTimeout(60000);

test("planning filters reconcile source transactions and preserve saved household scenarios", async ({
  page,
}) => {
  await page.goto("/planning");
  await expect(
    page.getByRole("heading", { name: "Household net worth" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Date range", { exact: true }),
    "month",
  );
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Shopping",
  );
  await page.getByLabel("Merchant search").fill("Loom");
  await expect(
    page.getByRole("heading", { name: "Source transactions" }),
  ).toBeVisible();
  const source = page.locator("#planning-transactions");
  await expect(
    source.getByRole("cell", { name: /Synthetic Loom/ }).first(),
  ).toBeVisible();
  await expect(source.getByRole("cell", { name: /Dining/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Scenario lab", exact: true }).click();
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
  await page.getByRole("link", { name: "Scenario lab", exact: true }).click();
  await page.getByLabel("Saved scenario").click();
  await expect(
    page.getByRole("option", {
      name: "Browser saved education alternative · v1",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await chooseOption(
    page,
    page.getByLabel("Household", { exact: true }),
    "synthetic-kaveri",
  );
  await page.getByLabel("Saved scenario").click();
  await expect(
    page.getByRole("option", {
      name: "Browser saved education alternative · v1",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await chooseOption(
    page,
    page.getByLabel("Household", { exact: true }),
    "synthetic-nila",
  );
  await chooseOption(page, page.getByLabel("Saved scenario"), {
    label: "Browser saved education alternative · v1",
  });
  await page
    .getByRole("button", { name: "Edit assumptions", exact: true })
    .click();
  await expect(
    page.getByLabel("Education goal in today's rupees", { exact: false }),
  ).toHaveValue("1800000");
  await page.getByRole("button", { name: "Cancel edits" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByLabel("Saved scenario").click();
  await expect(
    page.getByRole("option", {
      name: "Browser saved education alternative · v1",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("budgets and acknowledgments survive reload, desktop and large-text mobile remain contained", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/planning");
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await chooseOption(
    page,
    page.getByLabel("Date range", { exact: true }),
    "month",
  );
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Dining",
  );
  await page.getByLabel("Dining monthly budget INR").fill("100");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(
    page.getByText("Over budget", { exact: false }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await expect(page.getByLabel("Dining monthly budget INR")).toHaveValue("100");
  await page.getByRole("link", { name: /^Insights/ }).click();
  const insight = page
    .locator(".wp-insight")
    .filter({ hasText: "Provident fund valuation needs a refresh" });
  await insight
    .getByRole("button", { name: "Acknowledge", exact: true })
    .click();
  await page.reload();
  await page.getByRole("link", { name: /^Insights/ }).click();
  await expect(
    insight.getByRole("button", { name: "Reopen insight" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("planning-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await enlargeText(page);
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

test("partial-month drilldown preserves source totals and restores filters and keyboard focus on back", async ({
  page,
}) => {
  await page.goto("/planning");
  await page.getByRole("link", { name: "Cash flow", exact: true }).click();
  await page.getByLabel("From", { exact: true }).fill("2026-07-20");
  await page.getByLabel("Through", { exact: true }).fill("2026-08-05");
  await chooseOption(
    page,
    page.getByLabel("Account", { exact: true }),
    "synthetic-nila-card",
  );
  await chooseOption(page, page.getByLabel("Member", { exact: true }), "Nila");
  await chooseOption(
    page,
    page.getByLabel("Category", { exact: true }),
    "Groceries",
  );
  await page.getByLabel("Merchant search").fill("Fresh Basket");
  await page
    .getByText("Monthly values and drill-down", { exact: true })
    .click();
  const month = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: "2026-07", exact: true }) });
  const parentTotal = await month.getByRole("cell").nth(2).innerText();
  const inspect = month.getByRole("button", {
    name: "Inspect month",
    exact: true,
  });
  await inspect.click();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(
    "2026-07-20",
  );
  await expect(page.getByLabel("Through", { exact: true })).toHaveValue(
    "2026-07-31",
  );
  await expect(page.locator("#planning-transactions p strong")).toHaveText(
    parentTotal,
  );
  await expect(page.getByLabel("Merchant search")).toHaveValue("Fresh Basket");
  await page
    .getByRole("button", { name: "Back to previous view", exact: true })
    .click();
  await expect(page.getByLabel("Through", { exact: true })).toHaveValue(
    "2026-08-05",
  );
  await expect(page.getByLabel("Account", { exact: true })).toHaveAttribute(
    "data-value",
    "synthetic-nila-card",
  );
  await expect(page.getByLabel("Member", { exact: true })).toHaveText("Nila");
  await expect(inspect).toBeFocused();
});
