import { Schema } from "effect";
import { LoanRepaymentMarker } from "../repayments/loan-repayment-identity";
import { LoanQuote } from "./loans";

const minor = Schema.Number.pipe(Schema.int(), Schema.between(0, 100000000));
const id = Schema.Number.pipe(Schema.int(), Schema.positive());
export const LoanStatement = Schema.Struct({
  coverage: Schema.Literal("core-customer-transactions"),
  principal_paid_minor: minor,
  interest_paid_minor: minor,
  repayment_minor: minor,
  principal_outstanding_minor: minor,
  interest_outstanding_minor: minor,
  outstanding_minor: minor,
  transactions: Schema.Array(
    Schema.Struct({
      id,
      type_id: id,
      date: LoanQuote.fields.expected_disbursement_date,
      amount_minor: minor,
      principal_minor: minor,
      interest_minor: minor,
      fees_minor: minor,
      penalties_minor: minor,
      overpayment_minor: minor,
      unrecognized_income_minor: minor,
      manually_reversed: Schema.Boolean,
      transfer: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            id,
            amount_minor: minor,
            date: LoanQuote.fields.expected_disbursement_date,
            reversed: Schema.Boolean,
            repayment_marker: Schema.NullOr(LoanRepaymentMarker),
          }),
        ),
      ),
      reversed_on_date: Schema.NullOr(
        LoanQuote.fields.expected_disbursement_date,
      ),
    }),
  ).pipe(Schema.maxItems(1000)),
}).pipe(
  Schema.filter(
    (statement) =>
      statement.repayment_minor ===
        statement.principal_paid_minor + statement.interest_paid_minor &&
      statement.outstanding_minor ===
        statement.principal_outstanding_minor +
          statement.interest_outstanding_minor &&
      statement.transactions.length > 0 &&
      new Set(statement.transactions.map((row) => row.id)).size ===
        statement.transactions.length &&
      statement.transactions.every(
        (row, index) =>
          row.type_id !== 3 &&
          (index === 0 || row.date >= statement.transactions[index - 1].date) &&
          (!row.transfer ||
            (row.transfer.amount_minor === row.amount_minor &&
              row.transfer.date === row.date)) &&
          (row.reversed_on_date === null ||
            (row.manually_reversed && row.reversed_on_date >= row.date)) &&
          (row.type_id !== 2 ||
            row.amount_minor ===
              row.principal_minor +
                row.interest_minor +
                row.fees_minor +
                row.penalties_minor +
                row.overpayment_minor),
      ),
  ),
);
export type LoanStatement = typeof LoanStatement.Type;
export const loanTransactionLabel = (type: number) =>
  type === 1
    ? "Disbursement"
    : type === 2
      ? "Repayment"
      : type === 10
        ? "Accrual"
        : `Other Core transaction (type ${type})`;
export const loanStatementCoverage =
  "Core customer transactions: invalid, contra and automatic reversal entries are excluded by Core; manual reversals remain visible. This is not the complete accounting ledger.";

export const loanStatementCsv = (
  statement: LoanStatement,
  coreId: number,
  observedAt: number,
  stale: boolean,
) => {
  const money = (value: number) => (value / 100).toFixed(2);
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows: (string | number)[][] = [
    ["Source", "Apache Fineract", "Core loan", coreId],
    ["Observed at", new Date(observedAt).toISOString()],
    ["Freshness", stale ? "Stale saved observation" : "Saved observation"],
    ["Currency", "INR", "Coverage", loanStatementCoverage],
    ["Principal paid", money(statement.principal_paid_minor)],
    ["Interest paid", money(statement.interest_paid_minor)],
    ["Total repaid", money(statement.repayment_minor)],
    ["Principal outstanding", money(statement.principal_outstanding_minor)],
    ["Interest outstanding", money(statement.interest_outstanding_minor)],
    ["Total outstanding", money(statement.outstanding_minor)],
    [],
    [
      "Transaction",
      "Type",
      "Date",
      "Amount",
      "Principal allocation",
      "Interest allocation",
      "Fees allocation",
      "Penalties allocation",
      "Overpayment allocation",
      "Unrecognized income",
      "Manually reversed",
      "Reversed on",
    ],
    ...statement.transactions.map((row) => [
      row.id,
      loanTransactionLabel(row.type_id),
      row.date,
      money(row.amount_minor),
      money(row.principal_minor),
      money(row.interest_minor),
      money(row.fees_minor),
      money(row.penalties_minor),
      money(row.overpayment_minor),
      money(row.unrecognized_income_minor),
      row.manually_reversed ? "Yes" : "No",
      row.reversed_on_date ?? "",
    ]),
  ];
  return `${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
};
