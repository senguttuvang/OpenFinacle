import { Schema } from "effect";
import { LoanPostingEvidence } from "../../lending/domain/origination/loan-posting-evidence";
import { GlChart, JournalPage, ProductAccounting } from "./accounting";
import { LoanEnquiry } from "./loans";
export const LoanJournalPage = JournalPage.pipe(
  Schema.filter(
    (page) =>
      Number.isSafeInteger(page.totalFilteredRecords) &&
      page.totalFilteredRecords >= page.pageItems.length &&
      page.pageItems.length <= 200 &&
      new Set(page.pageItems.map((row) => row.id)).size ===
        page.pageItems.length &&
      page.pageItems.every(
        (row) =>
          Number.isSafeInteger(row.id) &&
          row.id > 0 &&
          row.currency.code === "INR" &&
          Number.isFinite(row.amount) &&
          row.amount >= 0 &&
          Number.isSafeInteger(Math.round(row.amount * 100)) &&
          row.amount === Math.round(row.amount * 100) / 100 &&
          [1, 2].includes(row.entryType.id),
      ),
  ),
);
export const LoanAccountingEvidence = Schema.Struct({
  customerId: Schema.String,
  branchId: Schema.String,
  loanId: Schema.Number,
  observedAt: Schema.Number,
  loan: LoanEnquiry.fields.loan,
  chart: Schema.NullOr(GlChart),
  product: Schema.NullOr(ProductAccounting),
  journals: Schema.NullOr(LoanJournalPage),
  coverage: Schema.Struct({
    offset: Schema.Number,
    limit: Schema.Number,
    sourceRows: Schema.Number,
    excludedRows: Schema.Number,
    hasMore: Schema.Boolean,
  }),
  posting: Schema.NullOr(LoanPostingEvidence),
  errors: Schema.Array(Schema.String),
});
export type LoanAccountingEvidence = typeof LoanAccountingEvidence.Type;
export const matchedLoanTransaction = (
  evidence: LoanAccountingEvidence,
  journal: (typeof JournalPage.Type)["pageItems"][number],
) =>
  journal.entityType?.id === 1 &&
  journal.entityId === evidence.loanId &&
  journal.transactionDetails
    ? (evidence.loan.transactions?.find(
        (row) => row.id === journal.transactionDetails?.transactionId,
      ) ?? null)
    : null;
export const matchedLoanReceipt = (
  evidence: LoanAccountingEvidence,
  transactionId: number,
) => {
  const transaction = evidence.loan.transactions?.find(
    (row) => row.id === transactionId,
  );
  const matches =
    evidence.posting?.receipts.filter(
      (r) =>
        r.transactionId === transactionId &&
        transaction?.type.id === (r.kind === "disbursement" ? 1 : 2),
    ) ?? [];
  return matches.length === 1 ? matches[0] : null;
};
