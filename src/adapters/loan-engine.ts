import { Effect, Layer, Schema } from "effect";
import { BankingError, dateFields } from "../domain/banking";
import { LoanEngine, type LoanQuoteInput } from "../domain/loan-engine";
import {
  LoanOwner,
  LoanQuote,
  normalizeLoanTerms,
  validateLoanSchedule,
} from "../domain/loans";
import { Core } from "../domain/ports";

const positiveId = Schema.Number.pipe(Schema.int(), Schema.positive());
const nonnegative = Schema.Number.pipe(Schema.nonNegative());
const option = <N extends number>(id: N) =>
  Schema.Struct({ id: Schema.Literal(id) });
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const Product = Schema.Struct({
  id: positiveId,
  shortName: Schema.Literal("OFPL"),
  currency,
  minPrincipal: Schema.Literal(10000),
  maxPrincipal: Schema.Literal(500000),
  minNumberOfRepayments: Schema.Literal(12),
  maxNumberOfRepayments: Schema.Literal(36),
  repaymentEvery: Schema.Literal(1),
  repaymentFrequencyType: option(2),
  interestRatePerPeriod: Schema.Literal(1),
  interestRateFrequencyType: option(2),
  amortizationType: option(1),
  interestType: option(0),
  interestCalculationPeriodType: option(1),
  transactionProcessingStrategyCode: Schema.Literal("mifos-standard-strategy"),
  accountingRule: option(2),
  multiDisburseLoan: Schema.Literal(false),
  isInterestRecalculationEnabled: Schema.Literal(false),
  canDefineInstallmentAmount: Schema.Literal(false),
  allowVariableInstallments: Schema.Literal(false),
  isLinkedToFloatingInterestRates: Schema.Literal(false),
  isFloatingInterestRateCalculationAllowed: Schema.Literal(false),
  canUseForTopup: Schema.Literal(false),
  enableDownPayment: Schema.Literal(false),
  enableAutoRepaymentForDownPayment: Schema.Literal(false),
  isEqualAmortization: Schema.Literal(false),
  isRatesEnabled: Schema.Literal(false),
  interestRecognitionOnDisbursementDate: Schema.Literal(false),
  enableIncomeCapitalization: Schema.optional(
    Schema.NullOr(Schema.Literal(false)),
  ),
  enableBuyDownFee: Schema.optional(Schema.NullOr(Schema.Literal(false))),
  holdGuaranteeFunds: Schema.optional(Schema.NullOr(Schema.Literal(false))),
  allowPartialPeriodInterestCalculation: Schema.optional(
    Schema.NullOr(Schema.Literal(false)),
  ),
  // Response enums use codes; their ordinal IDs differ between options and saved values.
  loanScheduleType: Schema.Struct({ code: Schema.Literal("CUMULATIVE") }),
  loanScheduleProcessingType: Schema.Struct({
    code: Schema.Literal("HORIZONTAL"),
  }),
  charges: Schema.Array(Schema.Unknown).pipe(
    Schema.filter((items) => items.length === 0),
  ),
});
const Savings = Schema.Struct({
  id: positiveId,
  clientId: positiveId,
  currency,
  status: Schema.Struct({ active: Schema.Literal(true) }),
});
const dateParts = Schema.Tuple(
  Schema.Number.pipe(Schema.int(), Schema.between(2000, 9999)),
  Schema.Number.pipe(Schema.int(), Schema.between(1, 12)),
  Schema.Number.pipe(Schema.int(), Schema.between(1, 31)),
);
const Disbursement = Schema.Struct({
  period: Schema.Literal(0),
  dueDate: dateParts,
  principalDisbursed: nonnegative,
  feeChargesDue: Schema.Literal(0),
  totalDueForPeriod: Schema.Literal(0),
  // Fineract's disbursement period omits these zero components in some schedules.
  penaltyChargesDue: Schema.optional(Schema.Literal(0)),
  interestDue: Schema.optional(Schema.Literal(0)),
  principalDue: Schema.optional(Schema.Literal(0)),
});
const Repayment = Schema.Struct({
  period: Schema.Number.pipe(Schema.int(), Schema.between(1, 36)),
  dueDate: dateParts,
  principalDue: nonnegative,
  interestDue: nonnegative,
  feeChargesDue: Schema.Literal(0),
  penaltyChargesDue: Schema.Literal(0),
  totalDueForPeriod: nonnegative,
  principalDisbursed: Schema.optional(Schema.Literal(0)),
});
const Schedule = Schema.Struct({
  currency,
  totalPrincipalDisbursed: nonnegative,
  totalPrincipalExpected: nonnegative,
  totalInterestCharged: nonnegative,
  totalFeeChargesCharged: Schema.Literal(0),
  totalPenaltyChargesCharged: Schema.Literal(0),
  totalRepaymentExpected: nonnegative,
  periods: Schema.Array(Schema.Union(Disbursement, Repayment)),
});
const invalid = (message: string, status = 503) =>
  new BankingError({ message, status });
const decode = <A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
  message: string,
  status = 503,
) =>
  Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError(() => invalid(message, status)),
  );
const minor = (value: number) => {
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) &&
    rounded >= 0 &&
    rounded <= 100000000 &&
    Math.abs(scaled - rounded) <= 0.000001
    ? Effect.succeed(rounded)
    : Effect.fail(
        invalid("The core loan amount cannot be verified to INR paise."),
      );
};
const calendar = (parts: readonly number[]) =>
  parts
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");

const normalizedSchedule = (input: unknown, request: LoanQuoteInput) =>
  Effect.gen(function* () {
    const raw = yield* decode(
      Schedule,
      input,
      "The core returned an unsupported loan schedule. No loan was submitted.",
    );
    const first = raw.periods[0];
    if (
      first?.period !== 0 ||
      !("principalDisbursed" in first) ||
      calendar(first.dueDate) !== request.expected_disbursement_date ||
      first.principalDisbursed !== request.terms.principal ||
      raw.totalPrincipalDisbursed !== request.terms.principal ||
      raw.periods.length !== request.terms.months + 1
    )
      return yield* Effect.fail(
        invalid(
          "The core loan schedule does not match the requested disbursement.",
        ),
      );
    const installments = yield* Effect.forEach(raw.periods.slice(1), (row) =>
      Effect.gen(function* () {
        if (
          row.period === 0 ||
          !("principalDue" in row) ||
          row.principalDue === undefined ||
          row.interestDue === undefined
        )
          return yield* Effect.fail(
            invalid(
              "The core loan schedule contains an unexpected disbursement.",
            ),
          );
        return {
          period: row.period,
          due_date: calendar(row.dueDate),
          principal_minor: yield* minor(row.principalDue),
          interest_minor: yield* minor(row.interestDue),
          total_minor: yield* minor(row.totalDueForPeriod),
        };
      }),
    );
    return yield* validateLoanSchedule(
      {
        currency: "INR",
        principal_minor: yield* minor(raw.totalPrincipalExpected),
        interest_minor: yield* minor(raw.totalInterestCharged),
        repayment_minor: yield* minor(raw.totalRepaymentExpected),
        installments,
      },
      request.terms,
      request.expected_disbursement_date,
    );
  });

export const loanEngineLayer = Layer.effect(
  LoanEngine,
  Effect.gen(function* () {
    const core = yield* Core;
    return {
      quote: (input: LoanQuoteInput) =>
        Effect.gen(function* () {
          const owner = yield* decode(
            LoanOwner,
            input.owner,
            "Choose an owned loan relationship and product.",
            400,
          );
          const terms = yield* normalizeLoanTerms(input.terms);
          const date = yield* decode(
            LoanQuote.fields.expected_disbursement_date,
            input.expected_disbursement_date,
            "Choose a valid expected disbursement date.",
            400,
          );
          const result = yield* Effect.all(
            {
              product: core.request("GET", `loanproducts/${owner.product_id}`),
              account: core.request(
                "GET",
                `savingsaccounts/${owner.savings_account_id}`,
              ),
            },
            { concurrency: 2 },
          );
          const product = yield* decode(
            Product,
            result.product,
            "The configured core loan product does not match the demo contract. Ask the operator to inspect product setup.",
          );
          const account = yield* decode(
            Savings,
            result.account,
            "An active owned INR savings account is required for this core loan quote.",
          );
          if (
            product.id !== owner.product_id ||
            account.id !== owner.savings_account_id ||
            account.clientId !== owner.client_id
          )
            return yield* Effect.fail(
              invalid(
                "The core loan product or savings ownership could not be verified.",
                403,
              ),
            );
          const schedule = yield* core.request(
            "POST",
            "loans?command=calculateLoanSchedule",
            {
              ...dateFields(),
              productId: owner.product_id,
              clientId: owner.client_id,
              principal: terms.principal,
              loanTermFrequency: terms.months,
              loanTermFrequencyType: 2,
              numberOfRepayments: terms.months,
              repaymentEvery: 1,
              repaymentFrequencyType: 2,
              interestRatePerPeriod: 1,
              interestType: 0,
              amortizationType: 1,
              interestCalculationPeriodType: 1,
              expectedDisbursementDate: date,
              transactionProcessingStrategyCode: "mifos-standard-strategy",
            },
          );
          return yield* normalizedSchedule(schedule, {
            owner,
            terms,
            expected_disbursement_date: date,
          });
        }),
    };
  }),
);
