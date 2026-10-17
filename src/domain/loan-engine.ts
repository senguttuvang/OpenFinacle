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
