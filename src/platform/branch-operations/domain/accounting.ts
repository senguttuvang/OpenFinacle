import { Schema } from "effect";
import { CoreDateEvidence } from "./core-account";

const named = Schema.Struct({
  id: Schema.Number,
  name: Schema.optional(Schema.String),
});
export const GlChart = Schema.Array(
  Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    glCode: Schema.String,
  }),
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
export const ProductAccounting = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  accountingRule: Schema.Struct({ id: Schema.Number, value: Schema.String }),
  accountingMappings: Schema.optional(
    Schema.Record({ key: Schema.String, value: named }),
  ),
});
export interface AccountingEvidence {
  coverage: {
    offset: number;
    limit: number;
    sourceRows: number;
    excludedRows: number;
    hasMore: boolean;
  };
  observedAt: number;
  chart: typeof GlChart.Type | null;
  journals: typeof JournalPage.Type | null;
  product: typeof ProductAccounting.Type | null;
  errors: string[];
}
