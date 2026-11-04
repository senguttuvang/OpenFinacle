import type { Page } from "@playwright/test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import { savedWorkspace } from "../../fixtures/workspace";

export const setupBranchStatement = async (page: Page) => {
  const day = branchDayFixture();
  day.reviewFixture = false;
  const data = savedWorkspace();
  data.role = "officer";
  const target = day.relationships[1].customer;
  const rows = Array.from({ length: 201 }, (_, i) => ({
    id: 10000 - i,
    accountId: target.account_id,
    accountNo: target.account_no,
    currency: { code: "INR", decimalPlaces: 2 },
    date: [2026, 11, 4],
    transactionType: { id: 1, value: "Deposit" },
    entryType: "CREDIT",
    amount: 1.25,
    runningBalance: i === 2 ? null : i === 1 ? -25.5 : 0,
    reversed: i === 2 ? null : false,
  }));
  const state: {
    bad: boolean;
    holdPage: boolean;
    holdExport: boolean;
    releasePage: null | (() => void);
    releaseExport: null | (() => void);
  } = {
    bad: false,
    holdPage: false,
    holdExport: false,
    releasePage: null,
    releaseExport: null,
  };
  const queries: URLSearchParams[] = [],
    writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (request.method() !== "GET") writes.push(path);
    if (path === "/api/dashboard") return route.fulfill({ json: data });
    if (path === "/api/branch") return route.fulfill({ json: day });
    if (path === "/api/telemetry-config") return route.fulfill({ json: {} });
    if (path !== "/api/branch/savings-statement")
      return route.fulfill({
        status: 404,
        json: { error: "Outside statement fixture", uncertain: false },
      });
    const params = url.searchParams;
    queries.push(new URLSearchParams(params));
    const from = params.get("from"),
      to = params.get("to"),
      mode = params.get("mode") ?? "page",
      pageNumber = Number(params.get("page") ?? 0);
    const selected = from === "2001-01-01" || to === "2001-01-01" ? [] : rows;
    if (mode === "export" && state.holdExport)
      await new Promise<void>((resolve) => {
        state.releaseExport = resolve;
      });
    if (mode === "page" && pageNumber === 1 && state.holdPage)
      await new Promise<void>((resolve) => {
        state.releasePage = resolve;
      });
    return route.fulfill({
      json: {
        source: "Fineract savings transaction search",
        branchId: day.branchId,
        customerId: target.id,
        customerReference: target.reference,
        account: {
          id: state.bad ? 9999 : target.account_id,
          clientId: target.client_id,
          accountNo: target.account_no,
          currency: { code: "INR", decimalPlaces: 2 },
          clientOfficeId: 1,
        },
        query: { from, to, page: pageNumber, mode },
        applicationDate: "2026-11-04",
        startedAt: Date.parse("2026-11-04T02:00:00Z"),
        observedAt: Date.parse("2026-11-04T02:00:01Z"),
        pageSize: 200,
        total: selected.length,
        rows:
          mode === "export"
            ? selected
            : selected.slice(pageNumber * 200, (pageNumber + 1) * 200),
      },
    });
  });
  await page.goto("/overview");
  const nav = page.getByRole("navigation", { name: "Branch day screens" });
  await nav.getByRole("button", { name: "Customers", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: target.display_name })
    .getByRole("button", { name: "Open customer 360", exact: true })
    .click();
  return {
    state,
    queries,
    writes,
    target,
    region: page.getByRole("region", {
      name: "Owned savings statement enquiry",
    }),
  };
};
