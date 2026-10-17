import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  buildLoanPilotCommand,
  loanPilotReport,
} from "../src/cli/loan-pilot-report";
import {
  type LoanDetail,
  safeLoanProofChecks,
} from "../src/domain/loan-workflow";
import { workflowQuote as quote } from "./fixtures/loan-workflow";

type Options = Parameters<typeof buildLoanPilotCommand>[0];
const options: Options = {
  action: "status",
  role: "customer",
  id: "",
  quoteId: "",
  key: "",
  version: -1,
  note: "Independent invented review",
  accept: false,
};
const build = (changes: Partial<Options> = {}) =>
  Effect.runPromise(buildLoanPilotCommand({ ...options, ...changes }));
const denied = (changes: Partial<Options>) =>
  Effect.runPromise(
    buildLoanPilotCommand({ ...options, ...changes }).pipe(Effect.flip),
  );
test("native pilot requires explicit original references, versions and quote acceptance rather than selecting a latest record", async () => {
  expect(await build()).toEqual({ kind: "list", role: "customer" });
  expect(await build({ id: "application-one" })).toEqual({
    kind: "detail",
    role: "customer",
    id: "application-one",
  });
  expect(await build({ key: "original-key" })).toEqual({
    kind: "reference",
    role: "customer",
    key: "original-key",
  });
  for (const changes of [
    { id: "application-one", key: "original-key" },
    { action: "register" },
    { action: "submit", quoteId: "quote-one", key: "original-key" },
    { action: "quote", id: "application-one" },
    { action: "inspect" },
  ] as const)
    expect(await denied(changes)).toBeInstanceOf(Error);
  expect(
    await build({
      action: "submit",
      quoteId: "quote-one",
      key: "original-key",
      accept: true,
    }),
  ).toEqual({
    kind: "submit",
    role: "customer",
    submission: { quote_id: "quote-one", consent: true },
    key: "original-key",
  });
  expect(
    await build({
      action: "register",
      role: "approver",
      id: "application-one",
      key: "original-key",
      version: 3,
    }),
  ).toMatchObject({
    kind: "action",
    role: "approver",
    command: { id: "application-one", action: "register", version: 3 },
    key: "original-key",
  });
  expect(
    await build({ action: "inspect", role: "approver", id: "application-one" }),
  ).toEqual({ kind: "inspect", role: "approver", id: "application-one" });
});
test("native quote is explicitly nonfinancial and reports only the selected invented Core schedule metadata", async () => {
  const request = await build({ action: "quote" });
  expect(request).toMatchObject({
    kind: "quote",
    role: "customer",
    terms: { principal: 12000, months: 12 },
  });
  const report = loanPilotReport({
    source: "fineract",
    quote,
    affordability: {
      maximum_installment_minor: 110000,
      surplus_minor: 1500000,
      within_declared_surplus: true,
    },
    application_created: false,
    financial_posted: false,
  });
  expect(report).toMatchObject({
    quote_id: quote.id,
    principal_minor: 1200000,
    installments: 12,
    application_created: false,
    financial_posted: false,
  });
  expect(JSON.stringify(report)).not.toContain("monthly_income");
});
test("native receipt output omits raw original notes, payloads and personal budget fields", () => {
  const marker = "synthetic-private-note-marker";
  const detail: LoanDetail = {
    inspection_checks: [
      "loan-transactions-shape",
      "transaction-reversal-shape",
    ],
    loan: {
      id: "application-one",
      bank_id: quote.bank_id,
      quote_id: quote.id,
      terms: quote.terms,
      status: "recommended",
      maker: "officer",
      checker: null,
      core_id: null,
      withdrawal_requested: false,
      version: 1,
      origin: "admin-pilot",
      accepted_at: quote.quoted_at + 1000,
      created_at: "2026-10-17",
      updated_at: "2026-10-17",
    },
    quote,
    core: null,
    operation: null,
    history: [
      {
        id: "event-one",
        actor: "customer",
        action: "submit",
        kind: "decision",
        note: "Invented acceptance",
        status: "submitted",
        operation_status: null,
        version: 0,
        created_at: "2026-10-17",
      },
      {
        id: "event-two",
        actor: "officer",
        action: "recommend",
        kind: "decision",
        note: marker,
        status: "recommended",
        operation_status: null,
        version: 1,
        created_at: "2026-10-17",
      },
    ],
    actions: [],
    unavailable_reason: null,
    financial_view_stale: false,
    recorded_key: "original-key",
    recorded_actor: "officer",
    recorded_request: {
      id: "application-one",
      version: 0,
      action: "recommend",
      note: marker,
    },
    recorded_operation: null,
  };
  const text = JSON.stringify(loanPilotReport(detail));
  expect(text).not.toContain(marker);
  expect(text).not.toContain("monthly_income");
  expect(text).not.toContain("recorded_request");
  expect(JSON.parse(text)).toMatchObject({
    loan_id: "application-one",
    status: "recommended",
    history_events: 2,
    origin: "admin-pilot",
    inspection_checks: [
      "loan-transactions-shape",
      "transaction-reversal-shape",
    ],
  });
  expect(
    safeLoanProofChecks([
      marker,
      "core-read",
      "core-read",
      "https://invented.invalid/private",
    ]),
  ).toEqual(["core-read"]);
});
