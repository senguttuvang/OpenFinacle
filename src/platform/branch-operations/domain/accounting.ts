import { Schema } from "effect";
import { CoreDateEvidence } from "./core-account";

const id = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.filter(Number.isSafeInteger),
);
const count = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.filter(Number.isSafeInteger),
);
const named = Schema.Struct({
  id,
  name: Schema.optional(Schema.String),
});
export const GlChart = Schema.Array(
  Schema.Struct({
    id,
    name: Schema.String,
    glCode: Schema.String,
  }),
).pipe(
  Schema.maxItems(2000),
  Schema.filter(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
  ),
);
export const JournalPage = Schema.Struct({
  totalFilteredRecords: Schema.Number,
  pageItems: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      officeId: Schema.Number,
      officeName: Schema.optional(Schema.String),
      glAccountId: Schema.Number,
      glAccountName: Schema.String,
      glAccountCode: Schema.String,
      transactionId: Schema.String,
      transactionDate: CoreDateEvidence,
      entryType: Schema.Struct({ id: Schema.Number, value: Schema.String }),
      amount: Schema.Number,
      currency: Schema.Struct({ code: Schema.String }),
      entityId: Schema.optional(Schema.Number),
      entityType: Schema.optional(
        Schema.Struct({ id: Schema.Number, value: Schema.String }),
      ),
      transactionDetails: Schema.optional(
        Schema.NullOr(Schema.Struct({ transactionId: Schema.Number })),
      ),
      reversed: Schema.optional(Schema.Boolean),
      referenceNumber: Schema.optional(Schema.String),
    }),
  ),
});
export const InrJournalPage = JournalPage.pipe(
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
          Number.isSafeInteger(row.officeId) &&
          row.officeId > 0 &&
          Number.isSafeInteger(row.glAccountId) &&
          row.glAccountId > 0 &&
          (!row.transactionDetails ||
            (Number.isSafeInteger(row.transactionDetails.transactionId) &&
              row.transactionDetails.transactionId > 0)) &&
          row.currency.code === "INR" &&
          Number.isFinite(row.amount) &&
          row.amount >= 0 &&
          Number.isSafeInteger(Math.round(row.amount * 100)) &&
          row.amount === Math.round(row.amount * 100) / 100 &&
          [1, 2].includes(row.entryType.id),
      ),
  ),
);

export const ProductAccounting = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  accountingRule: Schema.Struct({ id: Schema.Number, value: Schema.String }),
  accountingMappings: Schema.optional(
    Schema.Record({ key: Schema.String, value: named }),
  ),
});
export const AccountingEvidence = Schema.Struct({
  coverage: Schema.Struct({
    offset: count,
    limit: Schema.Literal(200),
    sourceRows: count,
    excludedRows: count,
    hasMore: Schema.Boolean,
  }),
  observedAt: Schema.Number.pipe(
    Schema.int(),
    Schema.between(0, 8640000000000000),
  ),
  chart: Schema.NullOr(GlChart),
  journals: Schema.NullOr(InrJournalPage),
  product: Schema.NullOr(ProductAccounting),
  errors: Schema.Array(Schema.String),
});
export type AccountingEvidence = typeof AccountingEvidence.Type;

export const journalPageHasExpectedCoverage = (
  page: typeof JournalPage.Type,
  offset: number,
) =>
  page.pageItems.length ===
  Math.min(200, Math.max(0, page.totalFilteredRecords - offset));
