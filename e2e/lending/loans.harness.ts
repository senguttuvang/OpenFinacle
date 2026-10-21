import { expect, type Page, test } from "@playwright/test";
import type { Role } from "../../src/platform/banking-workspace/domain/banking";
import { loanStatementCsv } from "../../src/platform/lending/domain/origination/loan-statements";
import type {
  LoanDetail,
  LoanOperation,
} from "../../src/platform/lending/domain/origination/loan-workflow";
import {
  type LoanCommand,
  type LoanQuote,
  loanAffordability,
} from "../../src/platform/lending/domain/origination/loans";
import { inventedLoanStatement } from "../../tests/fixtures/loan-statement";
import { loanView } from "../../tests/fixtures/loan-view";
import {
  workflowQuotedAt,
  workflowResult,
} from "../../tests/fixtures/loan-workflow";
import { openWorkspace } from "../fixtures/navigation";
import { savedWorkspace } from "../fixtures/workspace";

export function createHarness() {
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
      action:
        | "register"
        | "approve"
        | "disburse"
        | "undo_approval"
        | "withdraw",
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
                      statement: inventedLoanStatement(
                        state.saved.core.snapshot,
                      ),
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
      page.getByRole("heading", {
        name: "Review loan application",
        exact: true,
      }),
    ).toBeFocused();
  };
  const decide = async (page: Page, action: keyof typeof labels) => {
    await page
      .getByRole("button", { name: labels[action], exact: true })
      .click();
    await page
      .getByLabel("Decision note", { exact: true })
      .fill(
        `Independently reviewed ${labels[action].toLowerCase()} instruction.`,
      );
    await page
      .getByRole("button", { name: "Review loan instruction", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Review loan instruction",
        exact: true,
      }),
    ).toBeFocused();
    await page
      .getByRole("button", {
        name: `Confirm ${labels[action].toLowerCase()}`,
        exact: true,
      })
      .click();
  };
  return {
    get labels() {
      return labels;
    },
    get setup() {
      return setup;
    },
    get open() {
      return open;
    },
    get view() {
      return view;
    },
    get fillBudget() {
      return fillBudget;
    },
    get begin() {
      return begin;
    },
    get decide() {
      return decide;
    },
  };
}
