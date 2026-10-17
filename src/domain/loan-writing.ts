import { Context, Effect, Schema } from "effect";
import { BankingError, bankingDate } from "./banking";
import type { CoreLoanSnapshot } from "./loan-engine";
import {
  LoanOwner,
  LoanQuote,
  LoanTerms,
  loanAffordability,
  normalizeLoanTerms,
  validateLoanQuote,
} from "./loans";

const opaque = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/));
export const LoanWriteInstruction = Schema.Struct({
  owner: LoanOwner,
  terms: LoanTerms,
  quote: LoanQuote,
  consented_at: Schema.Number.pipe(Schema.int(), Schema.positive()),
  expected_disbursement_date: LoanQuote.fields.expected_disbursement_date,
  external_id: opaque,
  core_id: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  action: Schema.Literal(
    "register",
    "approve",
    "disburse",
    "undo_approval",
    "withdraw",
  ),
  key: opaque,
  date: LoanQuote.fields.expected_disbursement_date,
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
  transaction_external_id: Schema.optional(opaque),
});
export type LoanWriteInstruction = typeof LoanWriteInstruction.Type;
export interface LoanWriteResult {
  loan: CoreLoanSnapshot;
  transaction_id: number | null;
  transfer_id: number | null;
}
export interface LoanWriterService {
  // The application must durably reserve its authorized original operation first.
  dispatch: (
    input: LoanWriteInstruction,
  ) => Effect.Effect<LoanWriteResult, BankingError>;
  // Read-only; an absent or incompatible result never authorizes another dispatch.
  confirm: (
    input: LoanWriteInstruction,
  ) => Effect.Effect<LoanWriteResult, BankingError>;
}
export const LoanWriter = Context.GenericTag<LoanWriterService>(
  "OpenFinacle/LoanWriter",
);

export const validateLoanWriteInstruction = (
  input: unknown,
  now: number,
  mode: "dispatch" | "confirm",
) =>
  Effect.gen(function* () {
    const instruction = yield* Schema.decodeUnknown(LoanWriteInstruction, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "The original loan instruction could not be verified.",
            status: 400,
          }),
      ),
    );
    const terms = yield* normalizeLoanTerms(instruction.terms);
    if (
      instruction.note.trim().length < 5 ||
      (instruction.action === "register"
        ? instruction.core_id !== undefined
        : instruction.core_id === undefined) ||
      (instruction.action === "disburse"
        ? !instruction.transaction_external_id
        : instruction.transaction_external_id !== undefined)
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "Keep the original loan identity, reason and command correlation.",
          status: 400,
        }),
      );
    if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime()))
      return yield* Effect.fail(
        new BankingError({
          message: "The current banking date could not be verified.",
          status: 503,
        }),
      );
    const current = bankingDate(now);
    const quote = yield* validateLoanQuote(
      instruction.quote,
      terms,
      instruction.owner,
      instruction.consented_at,
    );
    if (
      instruction.consented_at > now ||
      quote.expected_disbursement_date !==
        instruction.expected_disbursement_date ||
      !loanAffordability(quote).within_declared_surplus
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "The original accepted quote, date and declared affordability must remain unchanged.",
          status: 409,
        }),
      );
    if (mode === "dispatch" && instruction.action === "register")
      yield* validateLoanQuote(quote, terms, instruction.owner, now);
    const financialStage =
      instruction.action === "register" ||
      instruction.action === "approve" ||
      instruction.action === "disburse";
    if (
      instruction.date < instruction.expected_disbursement_date ||
      instruction.date > current ||
      (financialStage &&
        instruction.date !== instruction.expected_disbursement_date) ||
      (mode === "dispatch" && instruction.date !== current)
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "The reviewed loan banking day changed. Request withdrawal and obtain a new quote; do not backdate or replace accepted terms.",
          status: 409,
        }),
      );
    return { ...instruction, terms, quote, note: instruction.note.trim() };
  });
