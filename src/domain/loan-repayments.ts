import { Context, Effect, Schema } from "effect";
import { BankingError, bankingDate } from "./banking";
import { CoreLoanSnapshot } from "./loan-engine";
import {
  LoanRepaymentOperationId,
  loanRepaymentCoreKey,
  loanRepaymentMarker,
} from "./loan-repayment-identity";
import { LoanOwner, LoanQuote, LoanTerms, normalizeLoanTerms } from "./loans";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const minor = Schema.Number.pipe(Schema.int(), Schema.between(0, 100000000));
const timestamp = Schema.Number.pipe(Schema.int(), Schema.positive());
const calendar = LoanQuote.fields.expected_disbursement_date;
export const LoanRepaymentAmount = Schema.Number.pipe(
  Schema.int(),
  Schema.between(10000, 50000000),
);
export const LoanRepaymentLookup = Schema.Struct({
  loan_id: LoanRepaymentOperationId,
  core_id: id,
  external_id: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
  owner: LoanOwner,
  terms: LoanTerms,
  expected_disbursement_date: calendar,
});
export type LoanRepaymentLookup = typeof LoanRepaymentLookup.Type;
const LoanRepaymentOffer = Schema.Struct({
  ...LoanRepaymentLookup.fields,
  id: LoanRepaymentOperationId,
  office_id: id,
  amount_minor: LoanRepaymentAmount,
  principal_outstanding_minor: minor,
  outstanding_minor: minor,
  available_minor: minor,
  payment_date: calendar,
  quoted_at: timestamp,
  expires_at: timestamp,
});
export type LoanRepaymentOffer = typeof LoanRepaymentOffer.Type;
export const LoanRepaymentInstruction = Schema.Struct({
  operation_id: LoanRepaymentOperationId,
  key: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
  offer: LoanRepaymentOffer,
  consented_at: timestamp,
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
});
export type LoanRepaymentInstruction = typeof LoanRepaymentInstruction.Type;
export const LoanRepaymentResult = Schema.Struct({
  operation_id: LoanRepaymentOperationId,
  loan: CoreLoanSnapshot,
  loan_transaction_id: id,
  savings_transaction_id: id,
  transfer_id: id,
  amount_minor: LoanRepaymentAmount,
  principal_minor: minor,
  interest_minor: minor,
  date: calendar,
}).pipe(
  Schema.filter(
    (result) =>
      result.loan.status === "active" &&
      result.amount_minor === result.principal_minor + result.interest_minor &&
      result.loan.statement?.transactions.filter(
        (row) =>
          row.transfer?.repayment_marker ===
          loanRepaymentMarker(result.operation_id),
      ).length === 1 &&
      result.loan.statement.transactions.some(
        (row) =>
          row.id === result.loan_transaction_id &&
          row.type_id === 2 &&
          !row.manually_reversed &&
          row.date === result.date &&
          row.amount_minor === result.amount_minor &&
          row.principal_minor === result.principal_minor &&
          row.interest_minor === result.interest_minor &&
          row.fees_minor === 0 &&
          row.penalties_minor === 0 &&
          row.overpayment_minor === 0 &&
          row.transfer?.id === result.transfer_id &&
          !row.transfer.reversed &&
          row.transfer.amount_minor === result.amount_minor &&
          row.transfer.date === result.date &&
          row.transfer.repayment_marker ===
            loanRepaymentMarker(result.operation_id),
      ),
  ),
);
export type LoanRepaymentResult = typeof LoanRepaymentResult.Type;
export interface LoanRepayerService {
  quote: (
    lookup: LoanRepaymentLookup,
    amountMinor: number,
  ) => Effect.Effect<
    { offer: LoanRepaymentOffer; loan: CoreLoanSnapshot },
    BankingError
  >;
  // The caller must first reserve its authorized immutable original and shared account claim.
  dispatch: (
    input: LoanRepaymentInstruction,
  ) => Effect.Effect<LoanRepaymentResult, BankingError>;
  // Read only; missing proof never permits another dispatch.
  confirm: (
    input: LoanRepaymentInstruction,
  ) => Effect.Effect<LoanRepaymentResult, BankingError>;
}
export const LoanRepayer = Context.GenericTag<LoanRepayerService>(
  "OpenFinacle/LoanRepayer",
);
const invalid = (
  message = "The original partial-repayment terms could not be verified.",
  status = 400,
) => new BankingError({ message, status });
const validTime = (now: number) =>
  Number.isSafeInteger(now) &&
  now > 0 &&
  Number.isFinite(new Date(now).getTime());
export const validateRepaymentOffer = (input: unknown) =>
  Effect.gen(function* () {
    const offer = yield* Schema.decodeUnknown(LoanRepaymentOffer, {
      onExcessProperty: "error",
    })(input).pipe(Effect.mapError(() => invalid()));
    yield* normalizeLoanTerms(offer.terms);
    if (
      !validTime(offer.quoted_at) ||
      !validTime(offer.expires_at) ||
      offer.external_id !== `of-loan-${offer.loan_id}` ||
      bankingDate(offer.quoted_at) !== offer.payment_date ||
      offer.expires_at !== offer.quoted_at + 900000 ||
      offer.expected_disbursement_date > offer.payment_date ||
      offer.amount_minor >= offer.principal_outstanding_minor ||
      offer.amount_minor > offer.available_minor ||
      offer.outstanding_minor < offer.principal_outstanding_minor
    )
      return yield* Effect.fail(
        invalid(
          "Review a current-day partial amount below principal outstanding and within available owned savings.",
          409,
        ),
      );
    return offer;
  });
export const validateRepaymentInstruction = (
  input: unknown,
  now: number,
  mode: "dispatch" | "confirm",
) =>
  Effect.gen(function* () {
    const original = yield* Schema.decodeUnknown(LoanRepaymentInstruction, {
      onExcessProperty: "error",
    })(input).pipe(Effect.mapError(() => invalid()));
    const offer = yield* validateRepaymentOffer(original.offer);
    if (!validTime(now))
      return yield* Effect.fail(
        invalid("The current repayment time could not be verified.", 503),
      );
    if (
      original.key !== loanRepaymentCoreKey(original.operation_id) ||
      original.note.trim().length < 5 ||
      original.consented_at < offer.quoted_at ||
      original.consented_at >= offer.expires_at ||
      original.consented_at > now ||
      bankingDate(original.consented_at) !== offer.payment_date
    )
      return yield* Effect.fail(
        invalid(
          "Keep the original accepted offer, authorization reason and repayment identity unchanged.",
          409,
        ),
      );
    if (
      mode === "dispatch" &&
      (now >= offer.expires_at || bankingDate(now) !== offer.payment_date)
    )
      return yield* Effect.fail(
        invalid(
          "The repayment offer expired. Review a new offer before a new instruction.",
          409,
        ),
      );
    return { ...original, note: original.note.trim() };
  });
