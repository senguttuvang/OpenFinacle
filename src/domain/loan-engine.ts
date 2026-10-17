import { Context, type Effect } from "effect";
import type { BankingError } from "./banking";
import type { LoanOwner, LoanSchedule, LoanTerms } from "./loans";

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
interface LoanDisbursement {
  id: number;
  external_id: string | null;
  date: string;
  amount_minor: number;
  reversed: boolean;
  transfer: {
    id: number;
    reversed: boolean;
    amount_minor: number;
    date: string;
  } | null;
}
export interface CoreLoanSnapshot {
  id: number;
  external_id: string;
  owner: LoanOwner;
  status: "registered" | "approved" | "active" | "withdrawn";
  principal_minor: number;
  annual_rate_bps: number;
  expected_disbursement_date: string;
  submitted_on_date: string;
  approved_on_date: string | null;
  withdrawn_on_date: string | null;
  actual_disbursement_date: string | null;
  principal_disbursed_minor: number | null;
  principal_outstanding_minor: number | null;
  outstanding_minor: number | null;
  schedule: LoanSchedule | null;
  disbursements: readonly LoanDisbursement[];
}
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
