import { Schema } from "effect";
import type { BankingCommand } from "../../banking-workspace/domain/banking";
import { isInrJournalEntry, JournalEntry } from "./accounting";
import { coreDate } from "./branch-day";

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
const time = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 8640000000000000),
);
export const CoreGlIdentity = Schema.Struct({
  id,
  name: Schema.String,
  glCode: Schema.String,
});
export const CoreClientOffice = Schema.Struct({
  id,
  officeId: id,
  officeName: Schema.optional(Schema.String),
});
export const CoreLoanOwner = Schema.Struct({ id, clientId: id });
export const RegisteredGlEvidence = Schema.Struct({
  branchId: Schema.String,
  anchorCustomerId: Schema.String,
  applicationDate: Schema.String.pipe(
    Schema.filter((d) => coreDate(d.split("-").map(Number)) === d),
  ),
  startedAt: time,
  observedAt: time,
  registryStartedAt: time,
  office: Schema.Struct({ id, name: Schema.optional(Schema.String) }),
  gl: CoreGlIdentity,
  coverage: Schema.Struct({
    offset: count,
    limit: Schema.Literal(200),
    sourceRows: count,
    excludedRows: count,
    hasMore: Schema.Boolean,
    totalProviderRows: count,
    registeredCustomers: count,
    loadedCustomers: count,
    eligibleAccounts: count,
    registryLimited: Schema.Boolean,
    workflowLimited: Schema.Boolean,
    loanOwnershipLimit: Schema.Literal(50),
    loanOwnershipLimited: Schema.Boolean,
    loanOwnershipFailures: count,
  }),
  rows: Schema.Array(
    Schema.Struct({
      customerId: Schema.NonEmptyString,
      customerName: Schema.String,
      family: Schema.Literal("Savings", "Loan"),
      accountId: id,
      originalCommandId: Schema.NullOr(Schema.NonEmptyString),
      journal: JournalEntry.pipe(
        Schema.filter(isInrJournalEntry),
        Schema.filter((r) => r.manualEntry === false),
      ),
    }),
  ).pipe(Schema.maxItems(200)),
  errors: Schema.Array(Schema.String),
}).pipe(
  Schema.filter(
    (v) =>
      v.coverage.sourceRows === v.rows.length + v.coverage.excludedRows &&
      v.coverage.sourceRows <= 200 &&
      v.coverage.eligibleAccounts <= v.coverage.loadedCustomers &&
      v.coverage.loadedCustomers <= v.coverage.registeredCustomers &&
      v.coverage.totalProviderRows >= v.coverage.sourceRows &&
      v.rows.every(
        (r) =>
          r.journal.officeId === v.office.id &&
          r.journal.glAccountId === v.gl.id &&
          r.journal.entityId === r.accountId &&
          r.journal.entityType?.id === (r.family === "Savings" ? 2 : 1) &&
          (r.family === "Savings" || r.originalCommandId === null),
      ),
  ),
);
export type RegisteredGlEvidence = typeof RegisteredGlEvidence.Type;
export const exactCashInstruction = (
  commands: readonly BankingCommand[],
  bankId: string,
  accountId: number,
  transactionId: number | undefined,
) => {
  if (!transactionId) return null;
  const matches = commands.filter(
    (c) =>
      c.bank_id === bankId &&
      c.account_id === accountId &&
      c.core_id === transactionId &&
      c.status === "posted" &&
      (c.kind === "deposit" || c.kind === "withdrawal"),
  );
  return matches.length === 1 ? matches[0].id : null;
};
