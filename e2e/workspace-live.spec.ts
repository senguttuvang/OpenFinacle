import { expect, test } from "@playwright/test";
import type { Dashboard } from "../src/domain/view";

test("deployed customer and branch screens use real saved data without financial mutations", async ({
  page,
}) => {
  const financialRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() !== "GET" &&
      !["/api/session", "/api/session/role", "/api/session/end"].includes(
        path,
      ) &&
      path.startsWith("/api/")
    )
      financialRequests.push(path);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore existing customer" }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === "/api/dashboard" &&
      item.request().method() === "GET",
  );
  await page.getByLabel("Demo persona").selectOption("officer");
  const data = (await (await response).json()) as Dashboard;
  expect(data.role).toBe("officer");
  expect(data.core.cached).toBe(true);
  expect(data.account?.id).toBeGreaterThan(0);
  await expect(
    page.getByRole("heading", { name: "Branch overview", exact: true }),
  ).toBeVisible();
  const pending =
    data.commands.filter((item) => item.status === "pending").length +
    Number(data.application?.status === "awaiting_approval");
  await expect(
    page.getByRole("button", { name: /Awaiting authorization/ }),
  ).toContainText(pending.toString().padStart(2, "0"));
  await page
    .getByRole("button", { name: "Find a screen", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Banking screens" }).fill("ACCBAL");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Everyday Savings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find a screen", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Banking screens" }).fill("FTI");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Ready for a second look/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "test-results/live-branch-workspace.png",
    fullPage: true,
  });
  await page.getByLabel("Demo persona").selectOption("customer");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/live-customer-workspace.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText(/Saved banking view.*Last synced/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Find a screen", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Banking screens" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "test-results/live-customer-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Choose another journey" }).click();
  expect(financialRequests).toEqual([]);
});
