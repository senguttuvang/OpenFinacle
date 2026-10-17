import { Effect, Layer, ParseResult, Schema } from "effect";
import { BankingError } from "../domain/banking";
import {
  type CoreLoanSnapshot,
  LoanEnquiry,
  type LoanLookup,
} from "../domain/loan-engine";
import { safeLoanProofChecks } from "../domain/loan-workflow";
import {
  LoanOwner,
  LoanQuote,
  LoanTerms,
  normalizeLoanTerms,
} from "../domain/loans";
import { Core } from "../domain/ports";
import {
  loanCoreCalendar,
  loanCoreDateParts,
  loanCoreMinor,
  normalizeCoreLoanSchedule,
} from "./loan-engine";
import { normalizeLoanStatement } from "./loan-statements";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const opaque = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/));
const option = <N extends number>(value: N) =>
  Schema.Struct({ id: Schema.Literal(value) });
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const nonnegative = Schema.Number.pipe(Schema.nonNegative());
const Lookup = Schema.Struct({
  owner: LoanOwner,
  terms: LoanTerms,
  expected_disbursement_date: LoanQuote.fields.expected_disbursement_date,
  external_id: opaque,
  core_id: Schema.optional(id),
});
const TransferBasic = Schema.Struct({
  id,
  reversed: Schema.Boolean,
  currency,
  transferAmount: nonnegative,
  transferDate: loanCoreDateParts,
});
const Transaction = Schema.Struct({
  id,
  type: Schema.Struct({ id }),
  currency,
  date: loanCoreDateParts,
  amount: nonnegative,
  manuallyReversed: Schema.Boolean,
  externalId: Schema.optional(Schema.NullOr(Schema.String)),
  transfer: Schema.optional(Schema.NullOr(TransferBasic)),
});
const Summary = Schema.Struct({
  principalDisbursed: nonnegative,
  principalOutstanding: nonnegative,
  totalOutstanding: nonnegative,
  feeChargesCharged: Schema.Literal(0),
  penaltyChargesCharged: Schema.Literal(0),
});
const Loan = Schema.Struct({
  id,
  externalId: opaque,
  clientId: id,
  loanProductId: id,
  loanType: option(1),
  linkedAccount: Schema.Struct({ id }),
  currency,
  principal: nonnegative,
  proposedPrincipal: nonnegative,
  approvedPrincipal: Schema.optional(Schema.NullOr(nonnegative)),
  termFrequency: id,
  termPeriodFrequencyType: option(2),
  numberOfRepayments: id,
  repaymentEvery: Schema.Literal(1),
  repaymentFrequencyType: option(2),
  interestRatePerPeriod: Schema.Literal(1),
  interestRateFrequencyType: option(2),
  annualInterestRate: Schema.Literal(12),
  amortizationType: option(1),
  interestType: option(0),
  interestCalculationPeriodType: option(1),
  transactionProcessingStrategyCode: Schema.Literal("mifos-standard-strategy"),
  multiDisburseLoan: Schema.Literal(false),
  isTopup: Schema.Literal(false),
  isInterestRecalculationEnabled: Schema.Literal(false),
  isFloatingInterestRate: Schema.Literal(false),
  status: Schema.Struct({
    id: Schema.Literal(100, 200, 300, 400),
    pendingApproval: Schema.Boolean,
    waitingForDisbursal: Schema.Boolean,
    active: Schema.Boolean,
    closed: Schema.Literal(false),
  }),
  timeline: Schema.Struct({
    submittedOnDate: loanCoreDateParts,
    approvedOnDate: Schema.optional(Schema.NullOr(loanCoreDateParts)),
    withdrawnOnDate: Schema.optional(Schema.NullOr(loanCoreDateParts)),
    expectedDisbursementDate: loanCoreDateParts,
    actualDisbursementDate: Schema.optional(Schema.NullOr(loanCoreDateParts)),
  }),
  summary: Schema.optional(Schema.NullOr(Summary)),
  repaymentSchedule: Schema.optional(Schema.Unknown),
  transactions: Schema.optional(Schema.NullOr(Schema.Array(Transaction))),
  // The pinned resource explicitly changes an empty charges collection to null.
  charges: Schema.optional(
    Schema.NullOr(
      Schema.Array(Schema.Unknown).pipe(
        Schema.filter((rows) => rows.length === 0),
      ),
    ),
  ),
});
const Transfer = Schema.Struct({
  ...TransferBasic.fields,
  // This endpoint returns AccountTransferData through Jackson, unlike the embedded legacy loan response.
  transferDate: LoanQuote.fields.expected_disbursement_date,
  fromClient: Schema.Struct({ id }),
  toClient: Schema.Struct({ id }),
  fromAccountType: option(1),
  toAccountType: option(2),
  fromAccount: Schema.Struct({ id }),
  toAccount: Schema.Struct({ id }),
});
const invalid = (
  message: string,
  status = 503,
  checks: readonly string[] = [],
) =>
  new BankingError({
    message,
    status,
    loanProofChecks: safeLoanProofChecks(checks),
  });
const shapeChecks: Readonly<Record<string, string>> = {
  summary: "loan-summary-shape",
  transactions: "loan-transactions-shape",
  "transactions.currency": "transaction-currency-shape",
  "transactions.manuallyReversed": "transaction-reversal-shape",
  "transactions.externalId": "transaction-identity-shape",
  "transactions.transfer": "transfer-summary-shape",
  timeline: "loan-timeline-shape",
  status: "loan-status-shape",
};
const decode = <A, I>(
  schema: Schema.Schema<A, I>,
  value: unknown,
  status = 503,
  stage = "loan-response-shape",
) =>
  Schema.decodeUnknown(schema, { errors: "all" })(value).pipe(
    Effect.mapError((error) =>
      invalid(
        "The core loan enquiry could not be verified. No operation was replayed.",
        status,
        [
          stage,
          ...ParseResult.ArrayFormatter.formatErrorSync(error).flatMap(
            (issue) => {
              const path = issue.path.filter(
                (part) => typeof part === "string",
              );
              return path.flatMap((_, index) => {
                const check = shapeChecks[path.slice(0, index + 1).join(".")];
                return check ? [check] : [];
              });
            },
          ),
        ],
      ),
    ),
  );
const date = (parts: readonly number[]) =>
  decode(LoanQuote.fields.expected_disbursement_date, loanCoreCalendar(parts));

export const loanEnquiryLayer = Layer.effect(
  LoanEnquiry,
  Effect.gen(function* () {
    const core = yield* Core;
    const readOwned = (input: LoanLookup) =>
      Effect.gen(function* () {
        const lookup = yield* decode(Lookup, input, 400);
        const terms = yield* normalizeLoanTerms(lookup.terms);
        const response = yield* core
          .request(
            "GET",
            `loans/external-id/${encodeURIComponent(lookup.external_id)}?associations=repaymentSchedule,transactions,charges,linkedAccount`,
          )
          .pipe(
            Effect.mapError((error) =>
              invalid(
                "Core loan read unavailable; inspect the original instruction.",
                error.status,
                ["core-read"],
              ),
            ),
          );
        const raw = yield* decode(Loan, response);
        if (
          raw.externalId !== lookup.external_id ||
          (lookup.core_id !== undefined && raw.id !== lookup.core_id) ||
          raw.clientId !== lookup.owner.client_id ||
          raw.loanProductId !== lookup.owner.product_id ||
          raw.linkedAccount.id !== lookup.owner.savings_account_id
        )
          return yield* Effect.fail(
            invalid(
              "The core loan does not match this owned application.",
              403,
              ["loan-ownership"],
            ),
          );
        const expected = yield* date(raw.timeline.expectedDisbursementDate);
        const submitted = yield* date(raw.timeline.submittedOnDate);
        const approved = raw.timeline.approvedOnDate
          ? yield* date(raw.timeline.approvedOnDate)
          : null;
        const withdrawn = raw.timeline.withdrawnOnDate
          ? yield* date(raw.timeline.withdrawnOnDate)
          : null;
        const principal = yield* loanCoreMinor(raw.principal);
        if (
          principal !== terms.principal * 100 ||
          raw.proposedPrincipal !== terms.principal ||
          ((raw.status.id === 200 || raw.status.id === 300) &&
            raw.approvedPrincipal !== terms.principal) ||
          (raw.approvedPrincipal != null &&
            raw.approvedPrincipal !== terms.principal) ||
          raw.numberOfRepayments !== terms.months ||
          raw.termFrequency !== terms.months ||
          expected !== lookup.expected_disbursement_date ||
          submitted !== expected ||
          (raw.status.id === 200 || raw.status.id === 300
            ? approved !== expected
            : approved !== null) ||
          (raw.status.id === 400
            ? !withdrawn || withdrawn < submitted
            : withdrawn !== null) ||
          raw.status.pendingApproval !== (raw.status.id === 100) ||
          raw.status.waitingForDisbursal !== (raw.status.id === 200) ||
          raw.status.active !== (raw.status.id === 300)
        )
          return yield* Effect.fail(
            invalid(
              "The core loan terms or state differ from the reviewed application.",
              503,
              ["loan-terms"],
            ),
          );
        const actual = raw.timeline.actualDisbursementDate
          ? yield* date(raw.timeline.actualDisbursementDate)
          : null;
        const active = raw.status.id === 300;
        if (
          active
            ? !actual || !raw.summary || !raw.transactions
            : actual !== null || (raw.summary?.principalDisbursed ?? 0) !== 0
        )
          return yield* Effect.fail(
            invalid(
              "The core loan state and disbursement facts are inconsistent.",
              503,
              ["loan-funding-facts"],
            ),
          );
        const disbursements = yield* Effect.forEach(
          (raw.transactions ?? []).filter((row) => row.type.id === 1),
          (row) =>
            Effect.gen(function* () {
              return {
                id: row.id,
                external_id: row.externalId || null,
                date: yield* date(row.date),
                amount_minor: yield* loanCoreMinor(row.amount),
                reversed: row.manuallyReversed,
                transfer: row.transfer
                  ? {
                      id: row.transfer.id,
                      reversed: row.transfer.reversed,
                      amount_minor: yield* loanCoreMinor(
                        row.transfer.transferAmount,
                      ),
                      date: yield* date(row.transfer.transferDate),
                    }
                  : null,
              };
            }),
        );
        if (!active && disbursements.length > 0)
          return yield* Effect.fail(
            invalid(
              "An undisbursed loan contains unexpected disbursement history.",
              503,
              ["loan-undisbursed-history"],
            ),
          );
        const snapshot: CoreLoanSnapshot = {
          id: raw.id,
          external_id: raw.externalId,
          owner: lookup.owner,
          status: active
            ? "active"
            : raw.status.id === 200
              ? "approved"
              : raw.status.id === 400
                ? "withdrawn"
                : "registered",
          principal_minor: principal,
          annual_rate_bps: 1200,
          expected_disbursement_date: expected,
          submitted_on_date: submitted,
          approved_on_date: approved,
          withdrawn_on_date: withdrawn,
          actual_disbursement_date: actual,
          principal_disbursed_minor: raw.summary
            ? yield* loanCoreMinor(raw.summary.principalDisbursed)
            : null,
          principal_outstanding_minor: raw.summary
            ? yield* loanCoreMinor(raw.summary.principalOutstanding)
            : null,
          outstanding_minor: raw.summary
            ? yield* loanCoreMinor(raw.summary.totalOutstanding)
            : null,
          schedule:
            active && actual
              ? yield* normalizeCoreLoanSchedule(raw.repaymentSchedule, {
                  ...lookup,
                  expected_disbursement_date: actual,
                }).pipe(
                  Effect.mapError((error) =>
                    invalid(
                      "The owned Core loan schedule could not be normalized.",
                      error.status,
                      ["schedule-normalization"],
                    ),
                  ),
                )
              : null,
          disbursements,
        };
        return { snapshot, response };
      });
    const inspect = (input: LoanLookup) =>
      readOwned(input).pipe(Effect.map((value) => value.snapshot));
    return {
      inspect,
      statement: (input: LoanLookup) =>
        Effect.gen(function* () {
          const { snapshot, response } = yield* readOwned(input);
          const statement = yield* normalizeLoanStatement(response, snapshot);
          return { ...snapshot, statement };
        }),
      confirmDisbursement: (
        input: LoanLookup & { transaction_external_id: string },
      ) =>
        Effect.gen(function* () {
          const external = yield* decode(
            opaque,
            input.transaction_external_id,
            400,
          );
          const loan = yield* inspect(input);
          const matching = loan.disbursements.filter(
            (row) => row.external_id === external,
          );
          const row = matching[0];
          if (
            loan.status !== "active" ||
            loan.principal_disbursed_minor !== loan.principal_minor ||
            matching.length !== 1 ||
            loan.disbursements.length !== 1 ||
            !row ||
            row.reversed ||
            !row.transfer ||
            row.transfer.reversed ||
            row.amount_minor !== loan.principal_minor ||
            row.transfer.amount_minor !== row.amount_minor ||
            row.date !== input.expected_disbursement_date ||
            loan.actual_disbursement_date !== row.date ||
            row.transfer.date !== row.date
          )
            return yield* Effect.fail(
              invalid(
                "The original savings disbursement could not be corroborated.",
                409,
                ["disbursement-correlation"],
              ),
            );
          const transfer = yield* decode(
            Transfer,
            yield* core
              .request("GET", `accounttransfers/${row.transfer.id}`)
              .pipe(
                Effect.mapError((error) =>
                  invalid(
                    "Core transfer read unavailable; inspect the original instruction.",
                    error.status,
                    ["core-read"],
                  ),
                ),
              ),
            503,
            "transfer-response-shape",
          );
          if (
            transfer.id !== row.transfer.id ||
            transfer.reversed ||
            transfer.fromAccount.id !== loan.id ||
            transfer.toAccount.id !== loan.owner.savings_account_id ||
            transfer.fromClient.id !== loan.owner.client_id ||
            transfer.toClient.id !== loan.owner.client_id ||
            (yield* loanCoreMinor(transfer.transferAmount)) !==
              row.amount_minor ||
            transfer.transferDate !== row.date
          )
            return yield* Effect.fail(
              invalid(
                "The core transfer does not corroborate the owned savings disbursement.",
                409,
                ["transfer-correlation"],
              ),
            );
          return {
            loan,
            transaction_id: row.id,
            transfer_id: transfer.id,
            date: row.date,
            amount_minor: row.amount_minor,
          };
        }).pipe(
          Effect.mapError(
            (error) =>
              new BankingError({
                message:
                  "The original loan disbursement remains unconfirmed. Inspect the saved instruction; do not repeat it.",
                status:
                  error.status === 400 || error.status === 403
                    ? error.status
                    : error.status >= 500
                      ? 503
                      : 409,
                uncertain: true,
                loanProofChecks: safeLoanProofChecks(error.loanProofChecks),
              }),
          ),
        ),
    };
  }),
);
