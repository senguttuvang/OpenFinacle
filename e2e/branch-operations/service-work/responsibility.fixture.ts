import type { Page } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import type { ResponsibilityEvent } from "../../../src/platform/branch-operations/domain/service-work/responsibility";
import { savedWorkspace } from "../../fixtures/workspace";

export async function responsibilityFixture(
  page: Page,
  role: "officer" | "approver" = "officer",
) {
  const data = savedWorkspace();
  data.role = role;
  const day = branchDayFixture();
  day.reviewFixture = false;
  const customer = day.relationships[0].customer;
  const record = {
    id: "responsibility-case",
    bank_id: customer.bank_id,
    kind: "email_change",
    detail: "Synthetic service ownership request",
    status: "open",
    created_at: "2026-11-04 01:00:00",
    updated_at: "2026-11-04 01:00:00",
    payload: JSON.stringify({
      email: "responsibility@example.test",
      explanation: "Synthetic branch service work",
    }),
    submitted_payload: "{}",
    version: 0,
    request_key: "responsibility-case-original",
    outcome_note: "",
    updated_by: "customer",
    delivery_status: "none",
  };
  day.relationships[0].requests = [record];
  for (const r of day.relationships.slice(1)) r.requests = [];
  const state = {
    data,
    day,
    customer,
    record,
    events: [] as ResponsibilityEvent[],
    posts: [] as {
      customerId: string;
      requestId: string;
      key: string;
      command: {
        version: number;
        owner: ResponsibilityEvent["owner"];
        note: string;
      };
    }[],
    reads: 0,
    writes: [] as string[],
    mode: "normal" as
      | "normal"
      | "lost_ack"
      | "lost_before_save"
      | "foreign_confirmation"
      | "conflict"
      | "foreign_read",
  };
  const detail = (confirmedEvent: ResponsibilityEvent | null = null) => ({
    source: "application_workflow",
    branchId: day.branchId,
    customerId: customer.id,
    requestId: record.id,
    observedAt: Date.parse("2026-11-04T01:00:00Z"),
    latest: state.events.at(-1) ?? null,
    history: state.events.slice(0, 200),
    historyComplete: state.events.length <= 200,
    confirmedEvent,
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path === "/api/branch/service-responsibility") {
      if (route.request().method() === "GET") {
        state.reads++;
        if (
          url.searchParams.get("customerId") !== customer.id ||
          url.searchParams.get("id") !== record.id
        )
          return route.fulfill({
            status: 404,
            json: { error: "Unowned fixture case", uncertain: false },
          });
        if (state.mode === "foreign_read")
          return route.fulfill({
            json: { ...detail(), customerId: "foreign" },
          });
        const key = url.searchParams.get("key"),
          found = key ? state.events.find((e) => e.key === key) : null;
        if (key && !found)
          return route.fulfill({
            status: 404,
            json: {
              error: "Original assignment not recorded at this read",
              uncertain: false,
            },
          });
        return route.fulfill({ json: detail(found ?? null) });
      }
      const input = route
        .request()
        .postDataJSON() as (typeof state.posts)[number];
      state.posts.push(input);
      const mode = state.mode;
      state.mode = "normal";
      if (mode === "lost_before_save")
        return route.fulfill({
          status: 503,
          json: {
            error: "Synthetic unavailable acknowledgement",
            uncertain: true,
          },
        });
      if (mode === "conflict")
        return route.fulfill({
          status: 409,
          json: {
            error: "Synthetic changed responsibility; refresh",
            uncertain: false,
          },
        });
      const found = state.events.find((e) => e.key === input.key);
      if (found) return route.fulfill({ json: detail(found) });
      const event: ResponsibilityEvent = {
        id: `assignment-event-${state.events.length + 1}`,
        branchId: day.branchId,
        customerId: customer.id,
        requestId: record.id,
        key: input.key,
        actor: state.data.role as "officer" | "approver",
        owner: input.command.owner,
        note: input.command.note,
        expectedVersion: input.command.version,
        version: input.command.version + 1,
        createdAt: "2026-11-04T01:01:00.000Z",
      };
      state.events.push(event);
      if (mode === "lost_ack")
        return route.fulfill({
          status: 503,
          json: {
            error: "Synthetic saved acknowledgement lost",
            uncertain: true,
          },
        });
      return route.fulfill({
        json:
          mode === "foreign_confirmation"
            ? { ...detail(event), customerId: "foreign" }
            : detail(event),
      });
    }
    if (route.request().method() !== "GET") state.writes.push(path);
    return route.fulfill({
      json:
        path === "/api/dashboard"
          ? data
          : path === "/api/branch"
            ? day
            : path === "/api/branch/service-case"
              ? { request: record, history: [], actions: [] }
              : {},
    });
  });
  const open = async () => {
    await page.goto("/overview");
    await page
      .getByRole("navigation", { name: "Branch day screens" })
      .getByRole("button", { name: "Daily control", exact: true })
      .click();
    const panel = page.getByRole("region", {
      name: `Service responsibility ${record.id}`,
      exact: true,
    });
    await panel
      .getByRole("button", {
        name: "Inspect service responsibility",
        exact: true,
      })
      .click();
    return panel;
  };
  return { ...state, state, open };
}
