import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

test("branch customer service history shows scoped decisions and delivery, clears stale evidence on failure", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const day = branchDayFixture();
  day.reviewFixture = false;
  const customer = day.relationships[0];
  customer.requests = [
    {
      id: "owned-request",
      bank_id: customer.customer.bank_id,
      kind: "address_change",
      detail: "Demo branch address maintenance",
      status: "fulfilled",
      created_at: "2026-11-03 10:00:00",
    },
  ];
  let fail = false;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/branch") return route.fulfill({ json: day });
    if (url.pathname === "/api/branch/service-case") {
      expect(url.searchParams.get("customerId")).toBe(customer.customer.id);
      expect(url.searchParams.get("id")).toBe("owned-request");
      expect(route.request().method()).toBe("GET");
      if (fail)
        return route.fulfill({ status: 503, json: { message: "Unavailable" } });
      return route.fulfill({
        json: {
          request: {
            ...customer.requests[0],
            payload: "{}",
            submitted_payload: "{}",
            version: 3,
            request_key: "stable-original-key",
            outcome_note: "Saved demo address approved",
            updated_by: "approver",
            updated_at: "2026-11-03 10:05:00",
            delivery_status: "not_recorded",
          },
          history: [
            {
              id: "event-one",
              request_id: "owned-request",
              actor: "approver",
              from_status: "awaiting_approval",
              to_status: "fulfilled",
              note: "Independent demo review",
              detail: "Original request approved",
              payload: "{}",
              delivery_status: "not_recorded",
              created_at: "2026-11-03 10:05:00",
            },
          ],
          actions: [],
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/overview");
  await page
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Account", exact: true })
    .click();
  const history = page.getByRole("region", {
    name: "Customer service history",
  });
  await history.getByRole("button", { name: /address_change/ }).click();
  await expect(
    history.getByText("Independent demo review", { exact: true }),
  ).toBeVisible();
  await expect(
    history
      .getByText("Delivery: Delivery not recorded", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    history.getByRole("button", { name: "Record completion" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  fail = true;
  await history
    .getByRole("button", { name: "Refresh service history" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(history.getByRole("alert")).toContainText(
    "could not be verified",
  );
  await expect(
    history.getByText("Independent demo review", { exact: true }),
  ).toHaveCount(0);
});
