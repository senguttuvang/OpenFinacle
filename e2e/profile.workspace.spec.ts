import { expect, test } from "@playwright/test";
import type { ProfileDetail } from "../src/domain/profile";
import { serviceCatalog } from "../src/domain/services";
import { savedWorkspace } from "./fixtures/workspace";

test("profile enquiry shows approved effects, source cases and shared staff state after reload", async ({
  page,
}) => {
  const data = savedWorkspace();
  const baseline = {
    email: "profile@example.test",
    phone: "9000000001",
    address: "14 Synthetic Avenue",
    city: "Chennai",
    pincode: "600020",
    home_branch: "Example South",
    employer: "Example Studio",
  };
  const id = "12345678-1234-4567-8901-123456789abc";
  const reference = "SR-123456781234";
  let saved: ProfileDetail = {
    profile: {
      bank_id: data.bank.id,
      fields: baseline,
      version: 0,
      updated_at: "2026-10-17T09:00:00Z",
    },
    history: [
      {
        id: "baseline",
        bank_id: data.bank.id,
        case_id: null,
        actor: "system",
        note: "Current synthetic baseline imported; earlier maintenance effects are unavailable.",
        fields: baseline,
        version: 0,
        created_at: "2026-10-17T09:00:00Z",
      },
    ],
  };
  let requestQuery = "";
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (url.pathname === "/api/profile") return route.fulfill({ json: saved });
    if (url.pathname === "/api/service-catalog")
      return route.fulfill({ json: { services: serviceCatalog } });
    if (url.pathname === "/api/service-cases") {
      requestQuery = url.searchParams.get("query") ?? "";
      return route.fulfill({
        json: { requests: [], total: 0, offset: 0, limit: 25 },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(page.locator(".detail-grid").first()).toContainText(
    "14 Synthetic Avenue",
  );
  const changed = {
    ...baseline,
    address: "88 Approved Avenue",
    email: "approved@example.test",
  };
  saved = {
    profile: { ...saved.profile, fields: changed, version: 1 },
    history: [
      ...saved.history,
      {
        id: "approved",
        bank_id: data.bank.id,
        case_id: id,
        actor: "approver",
        note: "Approved synthetic profile maintenance",
        fields: changed,
        version: 1,
        created_at: "2026-10-17T10:00:00Z",
      },
    ],
  };
  await page.getByRole("button", { name: "Refresh profile" }).click();
  await expect(page.locator(".detail-grid").first()).toContainText(
    "88 Approved Avenue",
  );
  await page.getByText(/Approved profile change ·/).click();
  await page
    .getByRole("button", { name: `View ${reference}`, exact: true })
    .click();
  await expect(
    page.getByLabel("Search request references or details"),
  ).toHaveValue(reference);
  await expect.poll(() => requestQuery).toBe(reference);
  await page.getByLabel("Demo persona").selectOption("officer");
  await page
    .getByRole("button", { name: "Customer profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Customer profile", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-grid").first()).toContainText(
    "approved@example.test",
  );
  await expect(
    page.getByRole("button", { name: "Request a profile change" }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Customer profile", exact: true })
    .click();
  await expect(page.locator(".detail-grid").first()).toContainText(
    "88 Approved Avenue",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("unverified and missing profile responses show truthful errors and onboarding", async ({
  page,
}) => {
  const data = savedWorkspace();
  let missing = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/profile")
      return route.fulfill({
        status: missing ? 404 : 200,
        json: missing ? { error: "No saved profile" } : {},
      });
    return route.fulfill({ json: path === "/api/dashboard" ? data : {} });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await expect(page.locator(".panel").getByRole("alert")).toContainText(
    "could not be verified",
  );
  await expect(page.locator(".detail-grid")).toHaveCount(0);
  missing = true;
  await page.getByRole("button", { name: "Refresh profile" }).click();
  await expect(
    page.getByRole("heading", { name: "No opened-account profile yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account opening", exact: true }),
  ).toBeVisible();
});
