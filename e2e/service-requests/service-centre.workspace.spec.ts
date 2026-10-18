import { expect, type Page, test } from "@playwright/test";
import type { CaseDetail } from "../../src/platform/service-requests/domain/service-cases";
import { serviceCatalog } from "../../src/platform/service-requests/domain/services";
import { chooseOption } from "../fixtures/form-select";
import { openWorkspace } from "../fixtures/navigation";
import { savedWorkspace } from "../fixtures/workspace";

const sampleCase = (): CaseDetail => ({
  request: {
    id: "12345678-1234-4567-8901-123456789abc",
    bank_id: "synthetic-workspace",
    kind: "chequebook",
    detail:
      "Number of cheque leaves: 25\nDelivery preference: Collect at branch",
    status: "open",
    created_at: "2026-10-17 08:00:00",
    updated_at: "2026-10-17T08:00:00Z",
    payload: JSON.stringify({ leaves: "25", delivery: "Collect at branch" }),
    submitted_payload: JSON.stringify({
      leaves: "25",
      delivery: "Collect at branch",
    }),
    version: 0,
    request_key: "synthetic-submission-key",
    outcome_note: "Request submitted",
    updated_by: "customer",
    delivery_status: "pending",
  },
  history: [
    {
      id: "event-submitted",
      request_id: "12345678-1234-4567-8901-123456789abc",
      actor: "customer",
      from_status: null,
      to_status: "open",
      note: "Request submitted",
      detail:
        "Number of cheque leaves: 25\nDelivery preference: Collect at branch",
      payload: "{}",
      delivery_status: "pending",
      created_at: "2026-10-17T08:00:00Z",
    },
  ],
  actions: ["cancel"],
});

async function openServices(page: Page) {
  await page.goto("/");
  await openWorkspace(page, "services");
  await expect(
    page.getByRole("heading", { name: "Customer service", exact: true }),
  ).toBeVisible();
}

test("completed maintenance distinguishes applied effects from imported history", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const payload = JSON.stringify({
    address: "88 Synthetic Avenue",
    city: "Chennai",
    pincode: "600020",
  });
  const legacy = sampleCase();
  legacy.request = {
    ...legacy.request,
    id: "11111111-1111-4111-8111-111111111111",
    kind: "address_change",
    status: "fulfilled",
    detail: "Synthetic address maintenance",
    payload,
    submitted_payload: payload,
    delivery_status: "none",
    profile_patch: null,
  };
  legacy.history = [
    {
      ...legacy.history[0],
      request_id: legacy.request.id,
      actor: "system",
      from_status: null,
      to_status: "fulfilled",
      note: "Completed case imported; earlier history unavailable",
      payload,
      delivery_status: "none",
    },
  ];
  legacy.actions = [];
  const applied = structuredClone(legacy);
  applied.request = {
    ...applied.request,
    id: "22222222-2222-4222-8222-222222222222",
    version: 3,
    profile_patch: payload,
  };
  const states = ["open", "in_progress", "awaiting_approval", "fulfilled"];
  applied.history = states.map((status, index) => ({
    ...legacy.history[0],
    id: `applied-${index}`,
    request_id: applied.request.id,
    actor: index === 0 ? "customer" : index === 3 ? "approver" : "officer",
    from_status: states[index - 1] ?? null,
    to_status: status,
    note: "Synthetic approval history",
    created_at: `2026-10-17T08:0${index}:00Z`,
  }));
  data.requests = [legacy.request, applied.request];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/service-catalog")
      return route.fulfill({ json: { services: serviceCatalog } });
    if (url.pathname === "/api/service-cases") {
      const id = url.searchParams.get("id");
      return route.fulfill({
        json: id
          ? id === legacy.request.id
            ? legacy
            : applied
          : { requests: data.requests, total: 2, offset: 0, limit: 25 },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await page.goto("/");
  await openWorkspace(page, "services");
  for (const [reference, effect] of [
    ["SR-111111111111", "no recorded profile effect"],
    ["SR-222222222222", "updated the saved synthetic customer profile"],
  ]) {
    await page
      .getByRole("button", { name: `View request ${reference}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Service request",
      exact: true,
    });
    await expect(dialog).toContainText(effect);
    await dialog.getByRole("button", { name: "Close service request" }).click();
  }
});

test("service directory validates and reviews details, records one request and restores focus on mobile", async ({
  page,
}) => {
  const data = savedWorkspace();
  let recorded: CaseDetail | null = null;
  const submissions: { key: string | undefined; body: unknown }[] = [];
  const listViews: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/service-catalog")
      return route.fulfill({ json: { services: serviceCatalog } });
    if (url.pathname === "/api/service-cases" && request.method() === "POST") {
      submissions.push({
        key: request.headers()["idempotency-key"],
        body: request.postDataJSON(),
      });
      recorded = sampleCase();
      recorded.request.kind = "address_change";
      recorded.request.delivery_status = "none";
      recorded.request.detail =
        "Address: 42 Sample Lane\nCity: Example City\nPIN code: 600020";
      return route.fulfill({ json: recorded });
    }
    if (url.pathname === "/api/service-cases") {
      listViews.push(url.searchParams.get("view") ?? "requests");
      return route.fulfill({
        json: {
          requests:
            recorded && url.searchParams.get("view") !== "deliveries"
              ? [recorded.request]
              : [],
          total:
            recorded && url.searchParams.get("view") !== "deliveries" ? 1 : 0,
          offset: 0,
          limit: 25,
        },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await openServices(page);
  await page
    .getByRole("searchbox", { name: "Search services" })
    .fill("update address");
  const service = page.getByRole("button", {
    name: /Update address Request a review/,
  });
  await service.click();
  const dialog = page.getByRole("dialog", { name: "Raise a service request" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Address", { exact: false }).fill("42 Sample Lane");
  await dialog.getByLabel("City").fill("Example City");
  await dialog.getByLabel("PIN code").fill("000000");
  await dialog
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("six-digit PIN code");
  expect(submissions).toEqual([]);
  await dialog.getByLabel("PIN code").fill("600020");
  await dialog
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Review your request" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Example City");
  await dialog.getByRole("button", { name: "Edit details" }).click();
  await expect(dialog.getByLabel("PIN code")).toHaveValue("600020");
  await dialog
    .getByRole("button", { name: "Review request", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm request", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("SR-123456781234");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Request history" }),
  ).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0].key).toMatch(/^[a-f0-9-]{36}$/);
  expect(submissions[0].body).toEqual({
    code: "address_change",
    fields: {
      address: "42 Sample Lane",
      city: "Example City",
      pincode: "600020",
    },
  });
  await page.keyboard.press("Escape");
  await expect(service).toBeFocused();
  await page.getByRole("link", { name: /Check your deliverables/ }).click();
  await expect(
    page.getByRole("heading", { name: "No deliverables yet" }),
  ).toBeVisible();
  expect(listViews).toContain("deliveries");
  await page.getByRole("link", { name: /Raise a new request/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await service.click();
  await expect(page.getByLabel("Address", { exact: false })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/service-form-mobile.png",
  });
});

for (const interruptedResponse of ["lost", "malformed"] as const) {
  test(`${interruptedResponse} submission responses survive reload and reconcile the same key without another POST`, async ({
    page,
  }) => {
    const data = savedWorkspace();
    const recorded = sampleCase();
    const keys: string[] = [];
    const lookups: string[] = [];
    await page.route("**/api/**", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/service-catalog")
        return route.fulfill({ json: { services: serviceCatalog } });
      if (
        url.pathname === "/api/service-cases" &&
        request.method() === "POST"
      ) {
        keys.push(request.headers()["idempotency-key"]);
        return interruptedResponse === "lost"
          ? route.abort("failed")
          : route.fulfill({ json: { request: { status: "fulfilled" } } });
      }
      if (
        url.pathname === "/api/service-cases" &&
        url.searchParams.has("key")
      ) {
        lookups.push(url.searchParams.get("key") ?? "");
        return route.fulfill({ json: recorded });
      }
      if (url.pathname === "/api/service-cases")
        return route.fulfill({
          json: {
            requests: keys.length ? [recorded.request] : [],
            total: keys.length,
            offset: 0,
            limit: 25,
          },
        });
      return route.fulfill({
        json: url.pathname === "/api/dashboard" ? data : {},
      });
    });
    await openServices(page);
    await page
      .getByRole("button", { name: /Request a chequebook Choose/ })
      .click();
    await chooseOption(page, page.getByLabel("Number of cheque leaves"), "25");
    await chooseOption(
      page,
      page.getByLabel("Delivery preference"),
      "Collect at branch",
    );
    await page
      .getByRole("button", { name: "Review request", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm request", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Check submission status" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Confirm request", exact: true }),
    ).not.toBeVisible();
    await page
      .getByRole("button", { name: "Close service request", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openWorkspace(page, "statements");
    await page.goBack();
    await expect(page).toHaveURL(/\/customer-service\/service-request$/);
    expect(keys).toHaveLength(1);
    await page.reload();
    await openWorkspace(page, "services");
    await page
      .getByRole("button", { name: /Request a chequebook Choose/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Check submission status" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check submission status" }).click();
    await expect(page.getByRole("dialog")).toContainText("SR-123456781234");
    expect(keys).toHaveLength(1);
    expect(lookups).toEqual(keys);
  });
}

test("staff reviews versioned actions and refreshes a conflicting case before another action", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "officer";
  const recorded = sampleCase();
  recorded.actions = ["start", "request_information", "reject"];
  data.requests = [recorded.request];
  const actions: unknown[] = [];
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/service-catalog")
      return route.fulfill({ json: { services: serviceCatalog } });
    if (url.pathname === "/api/service-cases/action") {
      actions.push(request.postDataJSON());
      await pending;
      recorded.request.status = "in_progress";
      recorded.request.version = 1;
      recorded.actions = ["fulfil", "request_information", "reject"];
      return route.fulfill({
        status: 409,
        json: { error: "This request changed. Refresh its history." },
      });
    }
    if (url.pathname === "/api/service-cases" && url.searchParams.has("id"))
      return route.fulfill({ json: recorded });
    if (url.pathname === "/api/service-cases")
      return route.fulfill({
        json: { requests: [recorded.request], total: 1, offset: 0, limit: 25 },
      });
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Open service requests/ }).click();
  await page.getByRole("button", { name: /View request SR-/ }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Request history" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", {
    name: "Service request",
    exact: true,
  });
  await chooseOption(
    page,
    dialog.getByRole("combobox", { name: "Action", exact: true }),
    "start",
  );
  await dialog.getByRole("button", { name: "Review action" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("button", { name: "Back to action" }),
  ).toBeFocused();
  await confirmation.getByRole("button", { name: "Confirm action" }).click();
  await expect(
    confirmation.getByRole("button", { name: "Recording…" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Demo persona")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeVisible();
  release();
  await expect(
    dialog.getByRole("button", { name: "Refresh request history" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("combobox", { name: "Action", exact: true }),
  ).not.toBeVisible();
  expect(actions).toEqual([
    { id: recorded.request.id, version: 0, action: "start", note: "" },
  ]);
  await dialog.getByRole("button", { name: "Refresh request history" }).click();
  await dialog.getByRole("combobox", { name: "Action", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Record completion", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Start processing", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toContainText("Being processed");
  expect(actions).toHaveLength(1);
});
