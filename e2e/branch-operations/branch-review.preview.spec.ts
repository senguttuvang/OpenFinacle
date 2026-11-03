import { expect, test } from "@playwright/test";

test("local review URL exposes six screens and visibly refuses a financial instruction", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/overview$/);
  const workspace = page.locator(".branch-day");
  await expect(
    workspace.getByText(/STATIC REVIEW FIXTURE — invented values/),
  ).toBeVisible();
  const navigation = workspace.getByRole("navigation", {
    name: "Branch day screens",
  });
  await expect(navigation.getByRole("button")).toHaveCount(6);
  await navigation
    .getByRole("button", { name: "Account", exact: true })
    .click();
  await expect(
    workspace.getByText(/Source: STATIC REVIEW FIXTURE · INR/),
  ).toBeVisible();
  await workspace.getByLabel("Amount in INR").fill("100");
  await workspace
    .getByRole("textbox", { name: "Original instruction", exact: true })
    .fill("Review only; must not be saved");
  await workspace
    .getByRole("button", { name: "Submit for independent approval" })
    .click();
  await expect(workspace.getByRole("alert")).toContainText(
    "Read-only static review fixture",
  );
  await navigation
    .getByRole("button", { name: "Accounting", exact: true })
    .click();
  await expect(workspace.getByRole("alert").last()).toContainText(
    "No Fineract journal",
  );
  await navigation
    .getByRole("button", { name: "Daily control", exact: true })
    .click();
  await expect(
    workspace.getByText("Close readiness · blocked", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/branch-review-daily-control.png",
    fullPage: true,
  });
});
