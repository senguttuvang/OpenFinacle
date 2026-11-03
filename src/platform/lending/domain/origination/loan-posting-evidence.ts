import { Schema } from "effect";
import { RoleSchema } from "../../../banking-workspace/domain/banking";

const id = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.filter(Number.isSafeInteger),
);
export const LoanPostingEvidence = Schema.Struct({
  applicationId: Schema.NullOr(Schema.String),
  receipts: Schema.Array(
    Schema.Struct({
      kind: Schema.Literal("disbursement", "repayment"),
      recordId: Schema.String,
      operationId: Schema.String,
      transactionId: id,
      actor: RoleSchema,
      observedAt: Schema.Number.pipe(Schema.finite()),
      historyComplete: Schema.Boolean,
      history: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          actor: RoleSchema,
          action: Schema.String,
          kind: Schema.String,
          note: Schema.String,
          version: Schema.Number,
          createdAt: Schema.String,
        }),
      ).pipe(Schema.maxItems(100)),
    }),
  ).pipe(Schema.maxItems(400)),
  errors: Schema.Array(Schema.String),
});
export type LoanPostingEvidence = typeof LoanPostingEvidence.Type;
