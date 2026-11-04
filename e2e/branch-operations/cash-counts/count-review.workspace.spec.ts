import { expect, test } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import {
  type CashCountEvent,
  cashDenominations,
} from "../../../src/platform/branch-operations/domain/cash-counts";
import { savedWorkspace } from "../../fixtures/workspace";

test("approver reads a saved declaration and reviews its exact version without financial refresh", async ({
  page,
}) => {
  const data = savedWorkspace();
  data.role = "approver";
  const day = branchDayFixture();
  day.reviewFixture = false;
  const original: CashCountEvent = {
    id: "declared-event",
    branchId: day.branchId,
    countId: "vault-count",
    key: "original-declare",
    actor: "officer",
    action: "declare",
    version: 1,
    status: "submitted",
    snapshot: {
      source: "synthetic_declaration",
      currency: "INR",
      boxType: "vault",
      label: "Synthetic reviewed vault",
      countDate: "2026-01-01",
      quantities: cashDenominations.map((denominationMinor) => ({
        denominationMinor,
        quantity: 0,
      })),
      totalMinor: 0,
    },
    note: "Zero explicitly declared",
    createdAt: "2026-11-04T01:30:00.000Z",
  };
  const history = [original];
  let branchReads = 0;
  const writes: unknown[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/branch") {
      branchReads++;
      return route.fulfill({ json: day });
    }
    if (url.pathname === "/api/telemetry-config")
      return route.fulfill({ json: {} });
    if (url.pathname === "/api/branch/cash-counts") {
      if (url.searchParams.has("id"))
        return route.fulfill({
          json: {
            branchId: day.branchId,
            record: original,
            history,
            historyComplete: true,
            actions: ["review", "return"],
            confirmedEvent: null,
          },
        });
      return route.fulfill({
        json: {
          branchId: day.branchId,
          observedAt: day.observedAt,
          limit: 100,
          limited: false,
          records: [original],
        },
      });
    }
    if (url.pathname === "/api/branch/cash-count-action") {
      const body = route.request().postDataJSON();
      writes.push(body);
      const event: CashCountEvent = {
        ...original,
        id: "review-event",
        key: body.key,
        actor: "approver",
        action: "review",
        version: 2,
        status: "reviewed",
        note: body.command.note,
        createdAt: "2026-11-04T01:31:00.000Z",
      };
      history.push(event);
      return route.fulfill({
        json: {
          branchId: day.branchId,
          record: event,
          history,
          historyComplete: true,
          actions: [],
          confirmedEvent: event,
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: "Outside fixture" } });
  });
  await page.goto("/overview");
  await page
    .getByRole("navigation", { name: "Branch day screens" })
    .getByRole("button", { name: "Daily control", exact: true })
    .click();
  const register = page.getByRole("region", {
    name: "Synthetic cash-count register",
  });
  await expect(
    register.getByRole("button", {
      name: "New count declaration",
      exact: true,
    }),
  ).toHaveCount(0);
  await register
    .getByRole("button", { name: "Read cash-count register", exact: true })
    .click();
  await register
    .getByRole("button", {
      name: /Synthetic reviewed vault · vault · submitted/,
    })
    .click();
  await register
    .getByRole("combobox", { name: "Count action", exact: true })
    .selectOption("review");
  await register
    .getByRole("textbox", { name: "Count action note", exact: true })
    .fill("Reviewed declaration, not physical cash");
  await register
    .getByRole("button", { name: "Save count action", exact: true })
    .click();
  await expect(register.getByRole("status")).toContainText(
    "Confirmed original review at version 2",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    customerId: day.relationships[0].customer.id,
    command: { id: "vault-count", version: 1, action: "review" },
  });
  await expect(
    register.getByRole("article", { name: "Saved count detail" }),
  ).toContainText("No count actions available");
  expect(branchReads).toBe(1);
  await expect(
    page.getByText("Close readiness · blocked", { exact: true }),
  ).toBeVisible();
});
