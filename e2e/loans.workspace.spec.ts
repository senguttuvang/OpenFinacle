import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type { Role } from "../src/domain/banking";
import { loanStatementCsv } from "../src/domain/loan-statements";
import type { LoanDetail, LoanOperation } from "../src/domain/loan-workflow";
import {
  type LoanCommand,
  type LoanQuote,
  loanAffordability,
} from "../src/domain/loans";
import { inventedLoanStatement } from "../tests/fixtures/loan-statement";
import { loanView } from "../tests/fixtures/loan-view";
import {
  workflowQuotedAt,
  workflowResult,
} from "../tests/fixtures/loan-workflow";
import { openWorkspace } from "./fixtures/navigation";
import { choosePersona } from "./fixtures/persona";
import { enlargeText } from "./fixtures/text-scale";
import { savedWorkspace } from "./fixtures/workspace";

test.use({ actionTimeout: 10000 });

const labels = {
  recommend: "Recommend application",
  register: "Register in Core",
  approve: "Approve loan",
  disburse: "Disburse to savings",
  cancel: "Cancel application",
  reject: "Reject application",
  request_withdrawal: "Request withdrawal",
  undo_approval: "Undo approval",
  withdraw: "Withdraw in Core",
};
const setup = async (
  page: Page,
  options: {
    lostSubmit?: boolean;
    malformedSubmit?: boolean;
    missingRegister?: boolean;
    uncertainDisburse?: boolean;
    initial?: "recommended";
    pauseRegister?: Promise<void>;
    conflictRegister?: boolean;
    now?: number;
  } = {},
) => {
  const now = options.now ?? workflowQuotedAt + 1000;
  await page.clock.setFixedTime(new Date(now));
  const data = savedWorkspace();
  const base = loanView(data.bank.id, now);
  const state = {
    saved: null as LoanDetail | null,
    quote: base.quote,
    quotes: 0,
    posts: [] as { path: string; key: string }[],
    financialWrites: 0,
    inspections: 0,
    refreshes: 0,
    failRefresh: false,
    statementEnabled: false,
  };
  const receipts = new Map<
    string,
    {
      actor: Role;
      request: LoanDetail["recorded_request"];
      operation: LoanOperation | null;
    }
  >();
  const append = (
    action: LoanDetail["history"][number]["action"],
    actor: Role,
    status: LoanDetail["loan"]["status"],
    kind: LoanDetail["history"][number]["kind"] = "decision",
    operation_status: LoanOperation["status"] | null = null,
    note = "Independently invented decision.",
  ) => {
    if (!state.saved) throw new Error("Missing fixture application");
    const version = state.saved.loan.version + 1;
    state.saved = {
      ...state.saved,
      loan: { ...state.saved.loan, status, version },
      history: [
        ...state.saved.history,
        {
          id: `invented-event-${version}`,
          version,
          actor,
          status,
          action,
          kind,
          operation_status,
          note,
          created_at: new Date(
            workflowQuotedAt + 1000 + version * 1000,
          ).toISOString(),
        },
      ],
    };
  };
  if (options.initial) {
    state.saved = base;
    append("recommend", "officer", "recommended");
    state.saved = {
      ...state.saved,
      loan: { ...state.saved.loan, maker: "officer" },
    };
    data.role = "approver";
  }
  const actions = (): LoanCommand["action"][] => {
    const s = state.saved;
    if (!s) return [];
    if (
      s.operation?.status === "uncertain" ||
      s.operation?.status === "executing"
    )
      return [];
    if (s.loan.status === "submitted")
      return data.role === "officer"
        ? ["recommend", "reject"]
        : data.role === "customer"
          ? ["cancel"]
          : [];
    if (s.loan.status === "recommended")
      return data.role === "approver"
        ? ["register", "reject"]
        : data.role === "customer"
          ? ["cancel"]
          : [];
    if (s.loan.status === "registered")
      return data.role === "approver"
        ? [s.loan.withdrawal_requested ? "withdraw" : "approve"]
        : data.role === "customer" && !s.loan.withdrawal_requested
          ? ["request_withdrawal"]
          : [];
    if (s.loan.status === "approved")
      return data.role === "approver"
        ? [s.loan.withdrawal_requested ? "undo_approval" : "disburse"]
        : data.role === "customer" && !s.loan.withdrawal_requested
          ? ["request_withdrawal"]
          : [];
    return [];
  };
  const reply = (key: string | null = null) => {
    if (!state.saved) return null;
    const record = key ? receipts.get(key) : null;
    return {
      ...state.saved,
      actions: actions(),
      recorded_key: record ? key : null,
      recorded_actor: record?.actor ?? null,
      recorded_request: record?.request ?? null,
      recorded_operation: record?.operation ?? null,
    };
  };
  const coreView = (
    action: "register" | "approve" | "disburse" | "undo_approval" | "withdraw",
  ) => {
    const s = state.saved;
    if (!s) throw new Error("Missing fixture application");
    const q = s.quote;
    return {
      source: "fineract" as const,
      synced_at: workflowQuotedAt + 1000,
      stale: false,
      snapshot: workflowResult({
        action,
        key: "of-loan-op-invented-original",
        external_id: `of-loan-${s.loan.id}`,
        owner: {
          bank_id: q.bank_id,
          product_id: q.product_id,
          client_id: q.client_id,
          savings_account_id: q.savings_account_id,
        },
        terms: q.terms,
        quote: q,
        consented_at: s.loan.accepted_at,
        date: q.expected_disbursement_date,
        expected_disbursement_date: q.expected_disbursement_date,
        core_id: 71,
        ...(action === "disburse"
          ? { transaction_external_id: "of-loan-disburse-invented-original" }
          : {}),
        note: "Independent fixture original.",
      }).loan,
    };
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = request.headers()["idempotency-key"] ?? "";
    if (url.pathname === "/api/session/role") {
      data.role = request.postDataJSON().role;
      return route.fulfill({ json: { role: data.role } });
    }
    if (url.pathname === "/api/loans/quote") {
      state.quotes++;
      const terms = request.postDataJSON() as LoanQuote["terms"];
      state.quote = {
        ...base.quote,
        id: `invented-quote-${state.quotes}`,
        terms,
      };
      return route.fulfill({
        json: {
          source: "fineract",
          quote: state.quote,
          affordability: loanAffordability(state.quote),
          application_created: false,
          financial_posted: false,
        },
      });
    }
    if (url.pathname === "/api/loans/statement") {
      const core = state.saved?.core;
      if (!core?.snapshot.statement)
        return route.fulfill({
          status: 409,
          json: { error: "No saved statement" },
        });
      return route.fulfill({
        body: loanStatementCsv(
          core.snapshot.statement,
          core.snapshot.id,
          core.synced_at,
          core.stale,
        ),
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="openfinacle-loan-${core.snapshot.id}.csv"`,
        },
      });
    }
    if (url.pathname === "/api/loans" && request.method() === "POST") {
      state.posts.push({ path: url.pathname, key });
      state.saved = {
        ...structuredClone(base),
        quote: state.quote,
        loan: {
          ...base.loan,
          terms: state.quote.terms,
          quote_id: state.quote.id,
        },
      };
      receipts.set(key, {
        actor: data.role,
        request: request.postDataJSON(),
        operation: null,
      });
      if (options.lostSubmit) {
        options.lostSubmit = false;
        return route.abort("failed");
      }
      if (options.malformedSubmit) {
        options.malformedSubmit = false;
        return route.fulfill({ json: { ...reply(key), history: [] } });
      }
      return route.fulfill({ json: reply(key) });
    }
    if (url.pathname === "/api/loans/action" && state.saved) {
      const input = request.postDataJSON() as LoanCommand;
      state.posts.push({ path: url.pathname, key });
      if (options.conflictRegister && input.action === "register") {
        append("reject", "approver", "rejected");
        return route.fulfill({
          status: 409,
          json: {
            error:
              "Another decision changed this application. Review its saved status.",
            uncertain: false,
          },
        });
      }
      if (input.action === "register" && options.pauseRegister)
        await options.pauseRegister;
      if (options.missingRegister && input.action === "register")
        return route.abort("failed");
      if (
        input.action === "recommend" ||
        input.action === "reject" ||
        input.action === "cancel" ||
        input.action === "request_withdrawal"
      ) {
        if (input.action === "recommend")
          state.saved = {
            ...state.saved,
            loan: { ...state.saved.loan, maker: "officer" },
          };
        if (input.action === "request_withdrawal")
          state.saved = {
            ...state.saved,
            loan: { ...state.saved.loan, withdrawal_requested: true },
          };
        append(
          input.action,
          data.role,
          input.action === "recommend"
            ? "recommended"
            : input.action === "reject"
              ? "rejected"
              : input.action === "cancel"
                ? "cancelled"
                : state.saved.loan.status,
          "decision",
          null,
          input.note,
        );
        receipts.set(key, {
          actor: data.role,
          request: input,
          operation: null,
        });
      } else {
        const before = state.saved.loan.status;
        append(
          input.action,
          "approver",
          before,
          "started",
          "executing",
          input.note,
        );
        const uncertain =
          input.action === "disburse" && options.uncertainDisburse;
        const target =
          input.action === "register" || input.action === "undo_approval"
            ? "registered"
            : input.action === "approve"
              ? "approved"
              : input.action === "withdraw"
                ? "withdrawn"
                : "active";
        const operation: LoanOperation = {
          id: `invented-operation-${state.posts.length}`,
          key,
          actor: "approver",
          action: input.action,
          status: uncertain ? "uncertain" : "confirmed",
          version: 1,
          started_at: workflowQuotedAt + 2000,
          observed_at: workflowQuotedAt + 3000,
          error: null,
        };
        state.saved = {
          ...state.saved,
          loan: { ...state.saved.loan, core_id: 71, checker: "approver" },
          operation,
          financial_view_stale: uncertain ?? false,
        };
        append(
          input.action,
          "approver",
          uncertain ? before : target,
          "outcome",
          operation.status,
          input.note,
        );
        if (!uncertain)
          state.saved = { ...state.saved, core: coreView(input.action) };
        if (input.action === "disburse") {
          state.financialWrites++;
          if (data.account?.summary)
            data.account.summary.accountBalance += 12000;
        }
        receipts.set(key, { actor: data.role, request: input, operation });
      }
      return route.fulfill({ json: reply(key) });
    }
    if (url.pathname === "/api/loans/inspect" && state.saved) {
      state.inspections++;
      const op = state.saved.operation;
      if (op?.status === "uncertain") {
        const confirmed = { ...op, status: "confirmed" as const, version: 2 };
        state.saved = {
          ...state.saved,
          operation: confirmed,
          financial_view_stale: false,
        };
        append(op.action, "approver", "active", "outcome", "confirmed");
        state.saved = { ...state.saved, core: coreView("disburse") };
        const prior = receipts.get(op.key);
        if (prior) receipts.set(op.key, { ...prior, operation: confirmed });
        return route.fulfill({ json: reply(op.key) });
      }
      return route.fulfill({ json: reply() });
    }
    if (url.pathname === "/api/loans/refresh" && state.saved) {
      state.refreshes++;
      if (state.saved.core)
        state.saved = {
          ...state.saved,
          core: {
            ...state.saved.core,
            stale: state.failRefresh,
            snapshot:
              state.statementEnabled && !state.failRefresh
                ? {
                    ...state.saved.core.snapshot,
                    statement: inventedLoanStatement(state.saved.core.snapshot),
                  }
                : state.saved.core.snapshot,
          },
        };
      return route.fulfill({ json: reply() });
    }
    if (url.pathname === "/api/loans") {
      const reference = url.searchParams.get("key");
      if (reference && !receipts.has(reference))
        return route.fulfill({
          status: 404,
          json: { error: "No original receipt visible", uncertain: false },
        });
      return route.fulfill({
        json:
          reference || url.searchParams.has("id")
            ? reply(reference)
            : { loans: state.saved ? [state.saved.loan] : [] },
      });
    }
    if (url.pathname === "/api/commands" && request.method() === "POST") {
      state.financialWrites++;
      return route.fulfill({
        status: 500,
        json: { error: "Unexpected financial route", uncertain: true },
      });
    }
    return route.fulfill({
      json: url.pathname === "/api/dashboard" ? data : {},
    });
  });
  return state;
};
const open = async (page: Page) => {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await openWorkspace(page, "loans");
  await expect(
    page.getByRole("heading", { name: /^(My loans|Customer lending)$/ }),
  ).toBeVisible();
};
const view = (page: Page) =>
  page
    .getByRole("button", { name: "View loan LN-B60427BE", exact: true })
    .click();
const fillBudget = async (page: Page) => {
  await page.getByLabel("Monthly income (₹)", { exact: true }).fill("30000");
  await page
    .getByLabel("Existing monthly commitments (₹)", { exact: true })
    .fill("5000");
  await page
    .getByLabel("Monthly living expenses (₹)", { exact: true })
    .fill("10000");
};
const begin = async (page: Page) => {
  await page
    .getByRole("button", { name: "Apply for a personal loan", exact: true })
    .click();
  await fillBudget(page);
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review loan application", exact: true }),
  ).toBeFocused();
};
const decide = async (page: Page, action: keyof typeof labels) => {
  await page.getByRole("button", { name: labels[action], exact: true }).click();
  await page
    .getByLabel("Decision note", { exact: true })
    .fill(
      `Independently reviewed ${labels[action].toLowerCase()} instruction.`,
    );
  await page
    .getByRole("button", { name: "Review loan instruction", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review loan instruction", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", {
      name: `Confirm ${labels[action].toLowerCase()}`,
      exact: true,
    })
    .click();
};

test("loan quote review, saved application and independent Core decisions recover uncertainty without another financial instruction", async ({
  page,
}) => {
  test.setTimeout(90000);
  const state = await setup(page, {
    lostSubmit: true,
    uncertainDisburse: true,
  });
  await page.goto("/");
  await open(page);
  await expect(
    page.getByRole("heading", { name: "No loan applications yet" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply for a personal loan", exact: true })
    .click();
  await fillBudget(page);
  await page.getByLabel("Principal (₹)", { exact: true }).fill("550");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  expect(state.quotes).toBe(0);
  await page.getByLabel("Principal (₹)", { exact: true }).fill("12000");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review loan application", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Edit loan terms", exact: true })
    .click();
  await expect(
    page.getByLabel("Monthly income (₹)", { exact: true }),
  ).toHaveValue("30000");
  await page.getByRole("radio", { name: /^home$/i }).check();
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(page.locator(".loan-form")).toContainText("₹13,200.00");
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  expect(state.posts).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /I accept these Core-calculated/ })
    .focus();
  await page.keyboard.press("Space");
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Check original loan instruction",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.posts).toHaveLength(1);
  await page.reload();
  await open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await expect(page.locator(".loan-detail")).toContainText("Submitted");
  expect(state.posts).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Recommend application", exact: true }),
  ).toHaveCount(0);
  await choosePersona(page, "officer");
  await open(page);
  await view(page);
  await decide(page, "recommend");
  await expect(page.locator(".loan-detail")).toContainText("Recommended");
  await choosePersona(page, "approver");
  await open(page);
  await view(page);
  await decide(page, "register");
  await expect(page.locator(".loan-core")).toContainText("#71");
  await decide(page, "approve");
  await expect(page.locator(".loan-detail")).toContainText(
    "Approved · not funded",
  );
  await decide(page, "disburse");
  await expect(
    page.getByRole("heading", {
      name: "Original instruction needs inspection",
    }),
  ).toBeVisible();
  expect(state.financialWrites).toBe(1);
  expect(state.refreshes).toBe(0);
  await page.reload();
  await open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inspect original Core outcome", exact: true })
    .click();
  await expect(page.locator(".loan-core")).toContainText("₹13,200.00");
  await expect(page.locator(".loan-core tbody tr")).toHaveCount(12);
  expect(state.financialWrites).toBe(1);
  expect(state.inspections).toBe(1);
  const visual = await page
    .locator(".loan-core thead th")
    .first()
    .evaluate((el) => ({
      foreground: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor,
      headerFont: parseFloat(getComputedStyle(el).fontSize),
      amountFont: parseFloat(
        getComputedStyle(el.closest("table")?.querySelector("td") ?? el)
          .fontSize,
      ),
      rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
    }));
  const lum = (color: string) => {
    const rgb = (color.match(/[\d.]+/g) ?? [])
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        const v = n / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const light = lum(visual.foreground),
    background = lum(visual.background);
  const headerContrast =
    (Math.max(light, background) + 0.05) / (Math.min(light, background) + 0.05);
  console.log(
    JSON.stringify({ loan_schedule_visual: { ...visual, headerContrast } }),
  );
  expect(headerContrast).toBeGreaterThanOrEqual(4.5);
  expect(visual.amountFont).toBeGreaterThanOrEqual(visual.rootFont);
  expect(visual.headerFont).toBeGreaterThanOrEqual(visual.rootFont * 0.9);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("openfinacle:loan-command:synthetic-workspace"),
      ),
    )
    .toBeNull();
  await page.screenshot({
    path: "/tmp/finacle4-loan-active-desktop.png",
    fullPage: true,
  });
  await choosePersona(page, "customer");
  await open(page);
  await view(page);
  await expect(
    page.getByRole("region", { name: "Saved loan statement" }),
  ).toContainText("No statement has been loaded");
  state.statementEnabled = true;
  await page
    .getByRole("button", { name: "Refresh Core observation", exact: true })
    .click();
  await expect(
    page
      .getByRole("table", { name: "Saved Core loan transactions" })
      .locator("tbody tr"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Saved loan statement" }),
  ).toContainText("Disbursement");
  await expect(
    page.getByRole("link", { name: "Download saved CSV", exact: true }),
  ).toHaveAttribute("href", `/api/loans/statement?id=${state.saved?.loan.id}`);
  expect(state.financialWrites).toBe(1);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download saved CSV", exact: true })
    .click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe("openfinacle-loan-71.csv");
  expect(await downloaded.failure()).toBeNull();
  const file = await downloaded.path();
  if (!file) throw new Error("Statement download unavailable");
  const csv = await readFile(file, "utf8");
  expect(csv).toContain('"Disbursement"');
  expect(csv).toContain('"Total repaid","0.00"');
  await page.screenshot({
    path: "/tmp/finacle4-loan-statement-desktop.png",
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Disburse to savings", exact: true }),
  ).toHaveCount(0);
  state.failRefresh = true;
  await page
    .getByRole("button", { name: "Refresh Core observation", exact: true })
    .click();
  await expect(page.locator(".loan-core")).toContainText(
    "Observation is stale",
  );
  expect(state.financialWrites).toBe(1);
  await expect(
    page.getByRole("region", { name: "Saved loan statement" }),
  ).toContainText("Stale saved statement");
  await expect(
    page
      .getByRole("table", { name: "Saved Core loan transactions" })
      .locator("tbody tr"),
  ).toHaveCount(1);
  await enlargeText(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  const schedule = page.locator(".loan-core .loan-schedule");
  await schedule.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => schedule.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  const transactions = page.getByRole("region", {
    name: "Loan transactions, scroll horizontally if needed",
    exact: true,
  });
  await transactions.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => transactions.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "/tmp/finacle4-loan-active-mobile-xl.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/finacle4-loan-active-zoom.png",
    fullPage: true,
  });
});

test("an absent original Core receipt never enables resend or local discard after reload", async ({
  page,
}) => {
  const state = await setup(page, {
    initial: "recommended",
    missingRegister: true,
  });
  await page.goto("/");
  await open(page);
  await view(page);
  await decide(page, "register");
  await expect(
    page.getByRole("heading", {
      name: "Check original loan instruction",
      exact: true,
    }),
  ).toBeVisible();
  const key = state.posts[0]?.key;
  await page.reload();
  await open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("Absence does not prove");
  await expect(
    page.getByRole("button", { name: "Send same nonfinancial instruction" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Leave local nonfinancial draft" }),
  ).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
  expect(state.financialWrites).toBe(0);
  await expect(
    page.getByRole("region", { name: "Original loan instruction" }),
  ).toContainText(key ?? "missing-key");
});
test("malformed application acknowledgement preserves the original across reload until a complete owned receipt is read", async ({
  page,
}) => {
  const state = await setup(page, { malformedSubmit: true });
  await page.goto("/");
  await open(page);
  await begin(page);
  await page
    .getByRole("checkbox", { name: /I accept these Core-calculated/ })
    .check();
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("could not be verified");
  await page.reload();
  await open(page);
  await page
    .getByRole("button", { name: "Check saved original status", exact: true })
    .click();
  await expect(page.locator(".loan-detail")).toContainText("Submitted");
  expect(state.posts).toHaveLength(1);
});
test("unavailable original storage blocks application submission before any POST", async ({
  page,
}) => {
  const state = await setup(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("openfinacle:loan-command:"))
        throw new DOMException(
          "Invented storage failure",
          "QuotaExceededError",
        );
      return set.call(this, key, value);
    };
  });
  await page.goto("/");
  await open(page);
  await begin(page);
  await page
    .getByRole("checkbox", { name: /I accept these Core-calculated/ })
    .check();
  await page
    .getByRole("button", { name: "Accept & submit application", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("could not be stored");
  expect(state.posts).toHaveLength(0);
  expect(state.financialWrites).toBe(0);
});

test("an in-flight original loan command disables role changes and duplicate confirmation until its saved response arrives", async ({
  page,
}) => {
  let release = () => {};
  const pauseRegister = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await setup(page, { initial: "recommended", pauseRegister });
  try {
    await page.goto("/");
    await open(page);
    await view(page);
    await decide(page, "register");
    await expect.poll(() => state.posts.length).toBe(1);
    await expect(
      page.getByRole("combobox", { name: "Demo persona" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Recording original instruction…",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Leave loan instruction", exact: true }),
    ).toBeDisabled();
    release();
    await expect(page.locator(".loan-core")).toContainText("#71");
    await expect(
      page.getByRole("combobox", { name: "Demo persona" }),
    ).toBeEnabled();
    expect(state.posts).toHaveLength(1);
    expect(state.financialWrites).toBe(0);
  } finally {
    release();
  }
});

test("a definite version conflict refreshes the same owned application without replay or an orphan local original", async ({
  page,
}) => {
  const state = await setup(page, {
    initial: "recommended",
    conflictRegister: true,
  });
  await page.goto("/");
  await open(page);
  await view(page);
  await decide(page, "register");
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("Another decision changed");
  await expect(page.locator(".loan-detail")).toContainText("Rejected");
  await expect(
    page.getByRole("button", { name: "Register in Core", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("openfinacle:loan-command:synthetic-workspace"),
      ),
    )
    .toBeNull();
  expect(state.posts).toHaveLength(1);
  expect(state.financialWrites).toBe(0);
});
test("expired and unaffordable quotes keep application submission unavailable while allowing terms to be edited", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/");
  await open(page);
  await page
    .getByRole("button", { name: "Apply for a personal loan", exact: true })
    .click();
  await fillBudget(page);
  await page.getByLabel("Monthly income (₹)", { exact: true }).fill("16000");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await expect(
    page.locator(".loan-workspace").getByRole("alert"),
  ).toContainText("exceeds your declared surplus");
  await expect(
    page.getByRole("button", {
      name: "Accept & submit application",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Edit loan terms", exact: true })
    .click();
  await page.getByLabel("Monthly income (₹)", { exact: true }).fill("30000");
  await page
    .getByRole("button", { name: "Get Core quote", exact: true })
    .click();
  await page.clock.setFixedTime(new Date(state.quote.expires_at + 1));
  await expect(
    page.getByRole("status").filter({ hasText: "This quote expired" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Accept & submit application",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});

test("a quote near Indian midnight shows the earlier banking deadline and expires before its fifteen-minute timestamp", async ({
  page,
}) => {
  const state = await setup(page, { now: Date.parse("2026-10-17T18:29:00Z") });
  await page.goto("/");
  await open(page);
  await begin(page);
  await expect(page.locator(".loan-form").getByRole("status")).toContainText(
    "18 Oct",
  );
  await expect(page.locator(".loan-form").getByRole("status")).toContainText(
    "IST",
  );
  await page.clock.setFixedTime(new Date("2026-10-17T18:30:00Z"));
  await expect(page.locator(".loan-form").getByRole("status")).toContainText(
    "This quote expired",
  );
  await expect(
    page.getByRole("button", {
      name: "Accept & submit application",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});
