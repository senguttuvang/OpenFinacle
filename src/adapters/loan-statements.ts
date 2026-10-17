import { Effect, Schema } from "effect";
import { BankingError } from "../domain/banking";
import type { CoreLoanSnapshot } from "../domain/loan-engine";
import { LoanStatement } from "../domain/loan-statements";
import { LoanQuote } from "../domain/loans";
import {
  loanCoreCalendar,
  loanCoreDateParts,
  loanCoreMinor,
} from "./loan-engine";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const amount = Schema.Number.pipe(Schema.nonNegative());
const calendar = LoanQuote.fields.expected_disbursement_date;
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const StatementResponse = Schema.Struct({
  id,
  externalId: Schema.String,
  summary: Schema.Struct({
    currency,
    principalPaid: amount,
    interestPaid: amount,
    totalRepayment: amount,
    principalOutstanding: amount,
    interestOutstanding: amount,
    totalOutstanding: amount,
    feeChargesPaid: Schema.Literal(0),
    penaltyChargesPaid: Schema.Literal(0),
    feeChargesOutstanding: Schema.Literal(0),
    penaltyChargesOutstanding: Schema.Literal(0),
  }),
  transactions: Schema.Array(
    Schema.Struct({
      id,
      loanId: Schema.optional(id),
      externalLoanId: Schema.optional(Schema.NullOr(Schema.String)),
      type: Schema.Struct({ id }),
      currency,
      date: loanCoreDateParts,
      amount,
      principalPortion: amount,
      interestPortion: amount,
      feeChargesPortion: amount,
      penaltyChargesPortion: amount,
      overpaymentPortion: amount,
      unrecognizedIncomePortion: amount,
      manuallyReversed: Schema.Boolean,
      reversedOnDate: Schema.optional(Schema.NullOr(loanCoreDateParts)),
    }),
  ).pipe(Schema.maxItems(1000)),
});
const invalid = () =>
  new BankingError({
    message:
      "The Core loan statement could not be verified. The previous saved observation remains stale; refresh explicitly to try reading again.",
    status: 503,
  });
const date = (parts: readonly number[]) =>
  Schema.decodeUnknown(calendar)(loanCoreCalendar(parts));

export const normalizeLoanStatement = (
  response: unknown,
  loan: CoreLoanSnapshot,
) =>
  Effect.gen(function* () {
    const raw = yield* Schema.decodeUnknown(StatementResponse)(response);
    const funded = loan.disbursements.filter((row) => !row.reversed);
    if (
      loan.status !== "active" ||
      raw.id !== loan.id ||
      raw.externalId !== loan.external_id ||
      raw.transactions.length === 0 ||
      funded.length !== 1 ||
      funded[0].amount_minor !== loan.principal_minor ||
      funded[0].date !== loan.actual_disbursement_date
    )
      return yield* Effect.fail(invalid());
    const transactions = yield* Effect.forEach(raw.transactions, (row) =>
      Effect.gen(function* () {
        if (
          (row.loanId !== undefined && row.loanId !== loan.id) ||
          (row.externalLoanId != null &&
            row.externalLoanId !== loan.external_id)
        )
          return yield* Effect.fail(invalid());
        const value = {
          id: row.id,
          type_id: row.type.id,
          date: yield* date(row.date),
          amount_minor: yield* loanCoreMinor(row.amount),
          principal_minor: yield* loanCoreMinor(row.principalPortion),
          interest_minor: yield* loanCoreMinor(row.interestPortion),
          fees_minor: yield* loanCoreMinor(row.feeChargesPortion),
          penalties_minor: yield* loanCoreMinor(row.penaltyChargesPortion),
          overpayment_minor: yield* loanCoreMinor(row.overpaymentPortion),
          unrecognized_income_minor: yield* loanCoreMinor(
            row.unrecognizedIncomePortion,
          ),
          manually_reversed: row.manuallyReversed,
          reversed_on_date: row.reversedOnDate
            ? yield* date(row.reversedOnDate)
            : null,
        };
        if (value.date < loan.submitted_on_date)
          return yield* Effect.fail(invalid());
        return value;
      }),
    );
    const summary = raw.summary;
    const statement = {
      coverage: "core-customer-transactions" as const,
      principal_paid_minor: yield* loanCoreMinor(summary.principalPaid),
      interest_paid_minor: yield* loanCoreMinor(summary.interestPaid),
      repayment_minor: yield* loanCoreMinor(summary.totalRepayment),
      principal_outstanding_minor: yield* loanCoreMinor(
        summary.principalOutstanding,
      ),
      interest_outstanding_minor: yield* loanCoreMinor(
        summary.interestOutstanding,
      ),
      outstanding_minor: yield* loanCoreMinor(summary.totalOutstanding),
      transactions,
    };
    if (
      statement.principal_outstanding_minor !==
        loan.principal_outstanding_minor ||
      statement.outstanding_minor !== loan.outstanding_minor
    )
      return yield* Effect.fail(invalid());
    return yield* Schema.decodeUnknown(LoanStatement)(statement);
  }).pipe(Effect.mapError(invalid));
