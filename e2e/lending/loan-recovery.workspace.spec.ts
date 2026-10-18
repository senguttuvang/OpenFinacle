import { expect, test } from "@playwright/test";
import { createHarness } from "./loans.harness";

const harness = createHarness();
test("a definite version conflict refreshes the same owned application without replay or an orphan local original", async ({
  page,
}) => {
  const state = await harness.setup(page, {
    initial: "recommended",
    conflictRegister: true,
  });
  await page.goto("/");
  await harness.open(page);
  await harness.view(page);
  await harness.decide(page, "register");
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("Another decision changed");
  await expect(page.locator(".loan-detail")).toContainText("Rejected");
  await expect(
    page.getByRole("button", { name: "Register in Core", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("openfinacle:loan-command:synthetic-workspace"),
      ),
    )
    .toBeNull();
  expect(state.posts).toHaveLength(1);
  expect(state.financialWrites).toBe(0);
});

test("expired and unaffordable quotes keep application submission unavailable while allowing terms to be edited", async ({
  page,
}) => {
  const state = await harness.setup(page);
  await page.goto("/");
  await harness.open(page);
  await page
    .getByRole("button", { name: "Apply for a personal loan", exact: true })
    .click();
  await harness.fillBudget(page);
  await page.getByLabel("Monthly income (₹)", { exact: true }).fill("16000");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("exceeds your declared surplus");
  await expect(
    page.getByRole("button", {
      name: "Accept & submit application",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Edit loan terms", exact: true })
    .click();
  await page.getByLabel("Monthly income (₹)", { exact: true }).fill("30000");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await page.clock.setFixedTime(new Date(state.quote.expires_at + 1));
  await expect(
    page.getByRole("status").filter({ hasText: "This quote expired" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Accept & submit application",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});

test("a quote near Indian midnight shows the earlier banking deadline and expires before its fifteen-minute timestamp", async ({
  page,
}) => {
  const state = await harness.setup(page, {
    now: Date.parse("2026-10-17T18:29:00Z"),
  });
  await page.goto("/");
  await harness.open(page);
  await harness.begin(page);
  await expect(page.locator(".loan-form").getByRole("status")).toContainText(
    "18 Oct",
  );
  await expect(page.locator(".loan-form").getByRole("status")).toContainText(
    "IST",
  );
  await page.clock.setFixedTime(new Date("2026-10-17T18:30:00Z"));
  await expect(page.locator(".loan-form").getByRole("status")).toContainText(
    "This quote expired",
  );
  await expect(
    page.getByRole("button", {
      name: "Accept & submit application",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});
