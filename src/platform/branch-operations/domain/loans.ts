import { Schema } from "effect";
import { coreDate } from "./branch-day";
import { CoreDateEvidence } from "./core-account";

const id = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.filter(Number.isSafeInteger),
);
const timestamp = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 8640000000000000),
);
const count = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.filter(Number.isSafeInteger),
);
const money = Schema.Number.pipe(
  Schema.finite(),
  Schema.nonNegative(),
  Schema.filter(
    (n) =>
      Number.isSafeInteger(Math.round(n * 100)) &&
      n === Math.round(n * 100) / 100,
  ),
);
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const CoreLoanSummary = Schema.Struct({
  currency,
  principalOutstanding: money,
  interestOutstanding: money,
  feeChargesOutstanding: money,
  penaltyChargesOutstanding: money,
  totalOutstanding: money,
  totalOverdue: money,
});
const CoreLoan = Schema.Struct({
  id,
  clientId: id,
  accountNo: Schema.NonEmptyString,
  loanProductId: id,
  loanProductName: Schema.optional(Schema.String),
  currency,
  status: Schema.Struct({ id, value: Schema.optional(Schema.String) }),
  principal: money,
  annualInterestRate: Schema.optional(Schema.Number.pipe(Schema.finite())),
  summary: Schema.optional(Schema.NullOr(CoreLoanSummary)),
});
export const CoreLoanPage = Schema.Struct({
  totalFilteredRecords: count,
  pageItems: Schema.Array(CoreLoan).pipe(Schema.maxItems(50)),
}).pipe(
  Schema.filter(
    (p) =>
      p.pageItems.length <= p.totalFilteredRecords &&
      new Set(p.pageItems.map((l) => l.id)).size === p.pageItems.length,
  ),
);
const period = Schema.Struct({
  period: Schema.optional(count),
  dueDate: CoreDateEvidence,
  principalDisbursed: Schema.optional(money),
  principalDue: Schema.optional(money),
  interestDue: Schema.optional(money),
  feeChargesDue: Schema.optional(money),
  penaltyChargesDue: Schema.optional(money),
  totalDueForPeriod: Schema.optional(money),
  totalPaidForPeriod: Schema.optional(money),
  totalOutstandingForPeriod: Schema.optional(money),
});
export const CoreLoanDetail = Schema.Struct({
  ...CoreLoan.fields,
  repaymentSchedule: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        currency,
        periods: Schema.Array(period).pipe(Schema.maxItems(1000)),
      }),
    ),
  ),
  transactions: Schema.optional(
    Schema.NullOr(
      Schema.Array(
        Schema.Struct({
          id,
          type: Schema.Struct({ id, value: Schema.optional(Schema.String) }),
          date: CoreDateEvidence,
          amount: money,
          currency,
          manuallyReversed: Schema.optional(Schema.Boolean),
        }),
      ).pipe(
        Schema.maxItems(2000),
        Schema.filter(
          (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
        ),
      ),
    ),
  ),
});
export const LoanExposure = Schema.Struct({
  branchId: Schema.String,
  applicationDate: Schema.String.pipe(
    Schema.filter((date) => coreDate(date.split("-").map(Number)) === date),
  ),
  startedAt: timestamp,
  observedAt: timestamp,
  complete: Schema.Boolean,
  coverage: Schema.Struct({
    totalCustomers: count,
    loadedCustomers: count,
    clientLimit: id,
    loanLimitPerClient: id,
    rowLimit: id,
    limited: Schema.Boolean,
    reportedLoans: Schema.NullOr(count),
  }),
  rows: Schema.Array(
    Schema.Struct({
      customerId: Schema.String,
      customerName: Schema.String,
      loan: CoreLoan,
    }),
  ).pipe(Schema.maxItems(500)),
  errors: Schema.Array(
    Schema.Struct({ customerId: Schema.String, message: Schema.String }),
  ),
});
export type LoanExposure = typeof LoanExposure.Type;
const EnquiryLoan = Schema.Struct({
  ...CoreLoanDetail.fields,
  repaymentSchedule: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        currency,
        periods: Schema.Array(
          Schema.Struct({ ...period.fields, sourceLine: id }),
        ).pipe(Schema.maxItems(1000)),
      }),
    ),
  ),
});
export const LoanEnquiry = Schema.Struct({
  customerId: Schema.String,
  branchId: Schema.String,
  observedAt: timestamp,
  loan: EnquiryLoan,
});
export type LoanEnquiry = typeof LoanEnquiry.Type;
export function loanExposureTotals(data: LoanExposure) {
  if (
    !data.complete ||
    data.coverage.limited ||
    data.errors.length ||
    data.coverage.loadedCustomers !== data.coverage.totalCustomers ||
    data.coverage.reportedLoans !== data.rows.length ||
    new Set(data.rows.map((r) => r.loan.id)).size !== data.rows.length
  )
    return null;
  const products = new Map<
    number,
    { name: string; loans: number; principalMinor: number; totalMinor: number }
  >();
  for (const { loan } of data.rows) {
    if (
      !loan.summary ||
      loan.currency.code !== "INR" ||
      loan.currency.decimalPlaces !== 2
    )
      return null;
    const row = products.get(loan.loanProductId) ?? {
      name: loan.loanProductName ?? `Core product ${loan.loanProductId}`,
      loans: 0,
      principalMinor: 0,
      totalMinor: 0,
    };
    row.loans++;
    row.principalMinor += Math.round(loan.summary.principalOutstanding * 100);
    row.totalMinor += Math.round(loan.summary.totalOutstanding * 100);
    if (
      !Number.isSafeInteger(row.principalMinor) ||
      !Number.isSafeInteger(row.totalMinor)
    )
      return null;
    products.set(loan.loanProductId, row);
  }
  return [...products].map(([id, value]) => ({ id, ...value }));
}
