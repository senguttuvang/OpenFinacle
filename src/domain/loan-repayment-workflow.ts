import { Schema } from "effect";
import { bankingDate, type Role, RoleSchema } from "./banking";
import { LoanRepaymentOperationId } from "./loan-repayment-identity";
import {
  LoanRepaymentAmount,
  LoanRepaymentInstruction,
  type LoanRepaymentOffer,
  LoanRepaymentResult,
} from "./loan-repayments";
import { LoanDetail } from "./loan-workflow";

const id = LoanRepaymentOperationId;
const version = Schema.Number.pipe(Schema.int(), Schema.nonNegative());
const time = Schema.Number.pipe(Schema.int(), Schema.positive());
const key = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/));
const status = Schema.Literal("executing", "uncertain", "confirmed", "failed");
export const RepaymentQuoteInput = Schema.Struct({
  loan_id: id,
  amount_minor: LoanRepaymentAmount,
});
export const RepaymentSubmission = Schema.Struct({
  offer_id: id,
  consent: Schema.Literal(true),
});
export const RepaymentCommand = Schema.Struct({
  id,
  version,
  action: Schema.Literal("recommend", "reject", "cancel", "pay"),
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
});
export type RepaymentCommand = typeof RepaymentCommand.Type;
export const RepaymentRequest = Schema.Union(
  RepaymentSubmission,
  RepaymentCommand,
);
export const RepaymentRecord = Schema.Struct({
  id,
  loan_id: id,
  bank_id: Schema.NonEmptyString,
  offer_id: id,
  account_id: Schema.Number.pipe(Schema.int(), Schema.positive()),
  origin: Schema.Literal("customer", "admin-pilot"),
  consented_at: time,
  status: Schema.Literal(
    "submitted",
    "recommended",
    "paid",
    "rejected",
    "cancelled",
  ),
  maker: Schema.NullOr(Schema.Literal("officer")),
  checker: Schema.NullOr(Schema.Literal("approver")),
  version,
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type RepaymentRecord = typeof RepaymentRecord.Type;
export const RepaymentOperation = Schema.Struct({
  id,
  key,
  actor: Schema.Literal("approver"),
  status,
  version,
  started_at: time,
  observed_at: time,
  error: Schema.NullOr(Schema.String),
  result: Schema.NullOr(LoanRepaymentResult),
});
export type RepaymentOperation = typeof RepaymentOperation.Type;
export const RepaymentEvent = Schema.Struct({
  id: Schema.NonEmptyString,
  actor: RoleSchema,
  action: Schema.Literal("submit", "recommend", "reject", "cancel", "pay"),
  kind: Schema.Literal("decision", "started", "outcome"),
  note: Schema.String,
  status: RepaymentRecord.fields.status,
  operation_status: Schema.NullOr(status),
  version,
  created_at: Schema.String,
});
export const RepaymentDetail = Schema.Struct({
  repayment: RepaymentRecord,
  offer: LoanRepaymentInstruction.fields.offer,
  core: LoanDetail.fields.core,
  operation: Schema.NullOr(RepaymentOperation),
  history: Schema.Array(RepaymentEvent),
  actions: Schema.Array(RepaymentCommand.fields.action),
  unavailable_reason: Schema.NullOr(Schema.String),
  financial_view_stale: Schema.Boolean,
  recorded_key: Schema.NullOr(key),
  recorded_actor: Schema.NullOr(RoleSchema),
  recorded_request: Schema.NullOr(RepaymentRequest),
  recorded_operation: Schema.NullOr(RepaymentOperation),
});
export type RepaymentDetail = typeof RepaymentDetail.Type;
export const RepaymentPreview = Schema.Struct({
  source: Schema.Literal("fineract"),
  offer: LoanRepaymentInstruction.fields.offer,
  request_created: Schema.Literal(false),
  financial_posted: Schema.Literal(false),
});
export const repaymentActions = (
  record: RepaymentRecord,
  offer: LoanRepaymentOffer,
  role: Role,
  pending: boolean,
  accountClaim: boolean,
  now: number,
) => {
  if (pending) return [];
  const valid =
    Number.isSafeInteger(now) &&
    now > 0 &&
    Number.isFinite(new Date(now).getTime()) &&
    now >= record.consented_at &&
    now < offer.expires_at &&
    bankingDate(now) === offer.payment_date;
  const actions: RepaymentCommand["action"][] = [];
  if (
    role === "customer" &&
    (record.status === "submitted" || record.status === "recommended")
  )
    actions.push("cancel");
  if (role === "officer" && record.status === "submitted") {
    if (valid) actions.push("recommend");
    actions.push("reject");
  }
  if (
    role === "approver" &&
    record.status === "recommended" &&
    record.maker === "officer"
  ) {
    if (valid && !accountClaim) actions.push("pay");
    actions.push("reject");
  }
  return actions;
};
