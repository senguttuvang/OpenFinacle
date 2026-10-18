import { Schema } from "effect";
import {
  bankingDate,
  type Role,
  RoleSchema,
} from "../../../banking-workspace/domain/banking";
import { CoreLoanSnapshot } from "./loan-engine";
import { LoanWriteInstruction } from "./loan-writing";
import { LoanCommand, LoanQuote, LoanRecord, loanActions } from "./loans";

const timestamp = Schema.Number.pipe(Schema.int(), Schema.positive());
export const LoanSubmission = Schema.Struct({
  quote_id: Schema.NonEmptyString,
  consent: Schema.Literal(true),
});
export type LoanSubmission = typeof LoanSubmission.Type;
export const LoanApplication = Schema.Struct({
  ...LoanRecord.fields,
  origin: Schema.Literal("customer", "admin-pilot"),
  accepted_at: timestamp,
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type LoanApplication = typeof LoanApplication.Type;
const LoanOperationStatus = Schema.Literal(
  "executing",
  "uncertain",
  "confirmed",
  "failed",
);
export const LoanOperation = Schema.Struct({
  id: Schema.NonEmptyString,
  action: LoanWriteInstruction.fields.action,
  key: Schema.NonEmptyString,
  actor: Schema.Literal("approver"),
  status: LoanOperationStatus,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  started_at: timestamp,
  observed_at: timestamp,
  error: Schema.NullOr(Schema.String),
});
export type LoanOperation = typeof LoanOperation.Type;
export const LoanEvent = Schema.Struct({
  id: Schema.NonEmptyString,
  actor: RoleSchema,
  action: Schema.Union(Schema.Literal("submit"), LoanCommand.fields.action),
  kind: Schema.Literal("decision", "started", "outcome"),
  note: Schema.String,
  status: LoanRecord.fields.status,
  operation_status: Schema.NullOr(LoanOperationStatus),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  created_at: Schema.String,
});
const LoanSavedCoreView = Schema.Struct({
  source: Schema.Literal("fineract"),
  snapshot: CoreLoanSnapshot,
  synced_at: timestamp,
  stale: Schema.Boolean,
});
export const LoanRequest = Schema.Union(LoanSubmission, LoanCommand);
const LoanProofCheck = Schema.Literal(
  "core-read",
  "loan-response-shape",
  "loan-summary-shape",
  "loan-transactions-shape",
  "transaction-currency-shape",
  "transaction-reversal-shape",
  "transaction-identity-shape",
  "transfer-summary-shape",
  "loan-timeline-shape",
  "loan-status-shape",
  "loan-ownership",
  "loan-terms",
  "loan-funding-facts",
  "loan-undisbursed-history",
  "schedule-normalization",
  "schedule-match",
  "disbursement-correlation",
  "transfer-response-shape",
  "transfer-correlation",
);
export const safeLoanProofChecks = (checks: readonly string[] | undefined) => [
  ...new Set((checks ?? []).filter(Schema.is(LoanProofCheck))),
];
export const LoanDetail = Schema.Struct({
  inspection_checks: Schema.optional(Schema.Array(LoanProofCheck)),
  loan: LoanApplication,
  quote: LoanQuote,
  core: Schema.NullOr(LoanSavedCoreView),
  operation: Schema.NullOr(LoanOperation),
  history: Schema.Array(LoanEvent),
  actions: Schema.Array(LoanCommand.fields.action),
  unavailable_reason: Schema.NullOr(Schema.String),
  financial_view_stale: Schema.Boolean,
  recorded_key: Schema.NullOr(Schema.String),
  recorded_actor: Schema.NullOr(RoleSchema),
  recorded_request: Schema.NullOr(LoanRequest),
  recorded_operation: Schema.NullOr(LoanOperation),
});
export type LoanDetail = typeof LoanDetail.Type;
export const LoanQuotePreview = Schema.Struct({
  source: Schema.Literal("fineract"),
  quote: LoanQuote,
  affordability: Schema.Struct({
    maximum_installment_minor: Schema.Number,
    surplus_minor: Schema.Number,
    within_declared_surplus: Schema.Boolean,
  }),
  application_created: Schema.Literal(false),
  financial_posted: Schema.Literal(false),
});
export type LoanQuotePreview = typeof LoanQuotePreview.Type;

export const availableLoanActions = (
  loan: LoanApplication,
  quote: LoanQuote,
  role: Role,
  unresolved: boolean,
  now: number,
  coreMismatch = false,
) => {
  const offered = loanActions(loan, role, unresolved);
  if (unresolved)
    return {
      actions: offered,
      reason:
        "Check the original instruction before making another loan decision.",
    };
  if (coreMismatch)
    return {
      actions: [],
      reason:
        "Core state differs from the recorded application. Ask the branch to inspect its original instructions.",
    };
  if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime()))
    return {
      actions: [],
      reason:
        "The current banking date could not be verified. Refresh before continuing.",
    };
  const dayChanged = bankingDate(now) !== quote.expected_disbursement_date;
  const expired =
    (loan.status === "submitted" || loan.status === "recommended") &&
    (now >= quote.expires_at || dayChanged);
  return {
    actions: offered.filter(
      (action) =>
        !(expired && (action === "recommend" || action === "register")) &&
        !(dayChanged && (action === "approve" || action === "disburse")),
    ),
    reason: expired
      ? "The quote expired. Cancel this application and review a new quote."
      : dayChanged &&
          (loan.status === "registered" || loan.status === "approved")
        ? "The accepted banking day changed. Request withdrawal before reviewing a new quote."
        : null,
  };
};
