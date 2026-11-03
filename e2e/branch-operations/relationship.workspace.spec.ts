import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

test("customer 360 uses zero core available balance, separate evidence and refreshed profile with mobile keyboard access", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const day = branchDayFixture();
  day.reviewFixture = false;
  const first = day.relationships[0];
  if (!first.account) throw new Error("Fixture account absent");
  first.account.summary = { accountBalance: 1000, availableBalance: 999 };
  first.requests = [
    {
      id: "case-done",
      bank_id: first.customer.bank_id,
      kind: "address",
      detail: "Completed synthetic case",
      status: "fulfilled",
      created_at: "2026-11-03",
    },
    {
      id: "case-open",
      bank_id: first.customer.bank_id,
      kind: "address",
      detail: "Pending synthetic case",
      status: "awaiting_approval",
      created_at: "2026-11-03",
    },
  ];
  let version = 0;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/telemetry-config")
      return route.fulfill({ json: {} });
    if (url.pathname === "/api/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/branch") return route.fulfill({ json: day });
    if (url.pathname === "/api/branch/relationship") {
      expect(url.searchParams.get("customerId")).toBe(first.customer.id);
      version++;
      const fields = {
        email: version > 1 ? "changed@example.test" : "demo@example.test",
        phone: "DEMO-PHONE-01",
        address: "Demo Sample Avenue",
        city: "Chennai",
        pincode: "600020",
        home_branch: "Synthetic preference",
        employer: "Demo employer",
      };
      const savings = {
        id: first.customer.account_id,
        accountNo: first.customer.account_no,
        status: { id: 300, value: "Active" },
        currency: { code: "INR", decimalPlaces: 2 },
        accountBalance: 1000,
        availableBalance: 0,
        productName: "Everyday Savings",
      };
      return route.fulfill({
        json: {
          observedAt: day.observedAt,
          client: {
            id: first.customer.client_id,
            accountNo: "CORE-CLIENT",
            displayName: first.customer.display_name,
            status: { id: 300, value: "Active" },
            legalForm: { id: 1, value: "Person" },
            officeId: 1,
            officeName: "Synthetic core office",
          },
          portfolio: { savingsAccounts: [savings] },
          selectedSavings: savings,
          coreDocuments: [
            {
              id: 5,
              name: "Unverified sample copy",
              fileName: "demo.pdf",
              size: 8,
            },
          ],
          charges: [],
          applicationDocuments: [
            {
              id: "doc",
              name: "Demo address metadata",
              kind: "address",
              size: 8,
              created_at: "2026-11-03",
            },
          ],
          profile: {
            profile: {
              bank_id: first.customer.bank_id,
              fields,
              version,
              updated_at: "2026-11-03",
            },
            history: [],
          },
          nominee: {
            choice: "add",
            name: "Demo Relative",
            relationship: "Sibling",
            version: 1,
          },
          errors: [],
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Outside customer enquiry fixture" },
    });
  });
  await page.goto("/overview");
  const workspace = page.locator(".branch-day");
  const nav = workspace.getByRole("navigation", { name: "Branch day screens" });
  await nav.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    workspace.locator(".account-facts").getByText("₹0.00", { exact: true }),
  ).toBeVisible();
  await expect(workspace.locator(".account-facts")).not.toContainText("999");
  await expect(workspace.getByText("Person", { exact: true })).toBeVisible();
  await expect(
    workspace.getByText("Unverified sample copy", { exact: false }),
  ).toBeVisible();
  await expect(
    workspace.getByText("Demo address metadata", { exact: false }),
  ).toBeVisible();
  const refresh = workspace.getByRole("button", {
    name: "Refresh customer 360",
  });
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(
    workspace.getByText("changed@example.test", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await nav.getByRole("button", { name: "Daily control", exact: true }).click();
  await expect(workspace.getByText(/Open service requests: 1/)).toBeVisible();
});
