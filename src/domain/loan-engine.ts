import { Context, type Effect, Schema } from "effect";
import type { BankingError } from "./banking";
import { LoanOwner, LoanQuote, LoanSchedule, type LoanTerms } from "./loans";

export interface LoanQuoteInput {
  owner: LoanOwner;
  terms: LoanTerms;
  expected_disbursement_date: string;
}
export interface LoanEngineService {
  quote: (input: LoanQuoteInput) => Effect.Effect<LoanSchedule, BankingError>;
}
export const LoanEngine = Context.GenericTag<LoanEngineService>(
  "OpenFinacle/LoanEngine",
);

export interface LoanLookup extends LoanQuoteInput {
  external_id: string;
  core_id?: number;
}
const identifier = Schema.Number.pipe(Schema.int(), Schema.positive());
const minor = Schema.Number.pipe(Schema.int(), Schema.between(0, 100000000));
const calendarDate = LoanQuote.fields.expected_disbursement_date;
const LoanDisbursement = Schema.Struct({
  id: identifier,
  external_id: Schema.NullOr(Schema.String),
  date: calendarDate,
  amount_minor: minor,
  reversed: Schema.Boolean,
  transfer: Schema.NullOr(
    Schema.Struct({
      id: identifier,
      reversed: Schema.Boolean,
      amount_minor: minor,
      date: calendarDate,
    }),
  ),
});
export const CoreLoanSnapshot = Schema.Struct({
  id: identifier,
  external_id: Schema.NonEmptyString,
  owner: LoanOwner,
  status: Schema.Literal("registered", "approved", "active", "withdrawn"),
  principal_minor: minor,
  annual_rate_bps: Schema.Literal(1200),
  expected_disbursement_date: calendarDate,
  submitted_on_date: calendarDate,
  approved_on_date: Schema.NullOr(calendarDate),
  withdrawn_on_date: Schema.NullOr(calendarDate),
  actual_disbursement_date: Schema.NullOr(calendarDate),
  principal_disbursed_minor: Schema.NullOr(minor),
  principal_outstanding_minor: Schema.NullOr(minor),
  outstanding_minor: Schema.NullOr(minor),
  schedule: Schema.NullOr(LoanSchedule),
  disbursements: Schema.Array(LoanDisbursement),
});
export type CoreLoanSnapshot = typeof CoreLoanSnapshot.Type;
interface LoanDisbursementProof {
  loan: CoreLoanSnapshot;
  transaction_id: number;
  transfer_id: number;
  date: string;
  amount_minor: number;
}
export interface LoanEnquiryService {
  inspect: (input: LoanLookup) => Effect.Effect<CoreLoanSnapshot, BankingError>;
  confirmDisbursement: (
    input: LoanLookup & { transaction_external_id: string },
  ) => Effect.Effect<LoanDisbursementProof, BankingError>;
}
export const LoanEnquiry = Context.GenericTag<LoanEnquiryService>(
  "OpenFinacle/LoanEnquiry",
);
