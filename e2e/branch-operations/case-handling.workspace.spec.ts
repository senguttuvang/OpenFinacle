import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../fixtures/workspace";

test("branch case action uses selected scope, confirms once and recovers lost acknowledgement without replay", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const day = branchDayFixture();
  day.reviewFixture = false;
  const customer = day.relationships[0].customer;
  let request = {
    id: "scoped-case",
    bank_id: customer.bank_id,
    kind: "email_change",
    detail: "Synthetic scoped email request",
    status: "open",
    created_at: "2026-11-04 01:00:00",
    updated_at: "2026-11-04 01:00:00",
    payload: JSON.stringify({
      email: "case@example.test",
      explanation: "Demo contact maintenance",
    }),
    submitted_payload: "{}",
    version: 0,
    request_key: "stable-case-key",
    outcome_note: "",
    updated_by: "customer",
    delivery_status: "none",
  };
  day.relationships[0].requests = [request];
  for (const other of day.relationships.slice(1)) other.requests = [];
  let posts = 0;
  const detail = () => ({
    request,
    history: [],
    actions:
      request.status === "open"
        ? ["start", "request_information", "reject"]
        : request.status === "in_progress"
          ? ["submit_for_approval", "reject"]
          : [],
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/branch") return route.fulfill({ json: day });
    if (
      url.pathname === "/api/branch/service-case" ||
      url.pathname === "/api/branch/service-case/action"
    ) {
      expect(url.searchParams.get("customerId")).toBe(customer.id);
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        expect(input.id).toBe(request.id);
        expect(input.version).toBe(request.version);
        posts++;
        request = {
          ...request,
          status: input.action === "start" ? "in_progress" : "rejected",
          version: request.version + 1,
          outcome_note: input.note,
          updated_by: "officer",
        };
        if (posts === 2)
          return route.fulfill({
            status: 503,
            json: { message: "Acknowledgement lost; inspect saved history" },
          });
      }
      return route.fulfill({ json: detail() });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/overview");
  const nav = page.getByRole("navigation", { name: "Branch day screens" });
  await nav.getByRole("button", { name: "Account", exact: true }).click();
  const history = page.getByRole("region", {
    name: "Customer service history",
  });
  await history.getByRole("button", { name: /email_change/ }).click();
  const act = async (name: string) => {
    await history
      .getByRole("combobox", { name: "Action", exact: true })
      .click();
    await page.getByRole("option", { name, exact: true }).click();
    await history
      .getByLabel(/Case note/)
      .fill("Synthetic branch case reviewed");
    await history
      .getByRole("button", { name: "Review action", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm action", exact: true })
      .click();
  };
  await act("Start processing");
  await expect(
    history.getByText("Case action recorded.", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await act("Decline request");
  await expect(
    history.getByText(
      "This request may have changed. Refresh and review its history before another action.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    history.getByRole("combobox", { name: "Action", exact: true }),
  ).toHaveCount(0);
  expect(posts).toBe(2);
  await history
    .getByRole("button", { name: "Refresh request history", exact: true })
    .click();
  await expect(
    history.getByText("Request history refreshed.", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(2);
  await nav.getByRole("button", { name: "Daily control", exact: true }).click();
  await expect(page.getByText(/Open service requests: 0\./)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
