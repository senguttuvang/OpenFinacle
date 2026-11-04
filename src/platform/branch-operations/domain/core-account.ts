import { Schema } from "effect";
import { coreDate } from "./branch-day";
import { InrMoney } from "./inr-money";
export const CoreDateEvidence = Schema.Array(Schema.Number).pipe(
  Schema.filter((date) => coreDate(date) !== "Unknown"),
);

const finite = Schema.Number.pipe(Schema.finite());
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
export const BranchAccountEvidence = Schema.Struct({
  nominalAnnualInterestRate: Schema.optional(finite),
  savingsProductId: Schema.optional(id),
  savingsProductName: Schema.optional(Schema.String),
  clientOfficeId: Schema.optional(id),
  clientOfficeName: Schema.optional(Schema.String),
  subStatus: Schema.optional(
    Schema.Struct({
      value: Schema.String,
      blockDebit: Schema.optional(Schema.Boolean),
      block: Schema.optional(Schema.Boolean),
    }),
  ),
  interestCompoundingPeriodType: Schema.optional(
    Schema.Struct({ id: Schema.Number, value: Schema.String }),
  ),
  interestPostingPeriodType: Schema.optional(
    Schema.Struct({ id: Schema.Number, value: Schema.String }),
  ),
  interestCalculationType: Schema.optional(
    Schema.Struct({ id: Schema.Number, value: Schema.String }),
  ),
  interestCalculationDaysInYearType: Schema.optional(
    Schema.Struct({ id: Schema.Number, value: Schema.String }),
  ),
  withdrawalFeeForTransfers: Schema.optional(Schema.Boolean),
  allowOverdraft: Schema.optional(Schema.Boolean),
  enforceMinRequiredBalance: Schema.optional(Schema.Boolean),
  withHoldTax: Schema.optional(Schema.Boolean),
  id,
  accountNo: Schema.String,
  clientId: id,
  clientName: Schema.String,
  status: Schema.Struct({
    id: Schema.Number,
    value: Schema.optional(Schema.String),
  }),
  currency: Schema.optional(
    Schema.Struct({ code: Schema.String, decimalPlaces: Schema.Number }),
  ),
  summary: Schema.optional(
    Schema.Struct({
      accountBalance: InrMoney,
      totalInterestPosted: Schema.optional(InrMoney),
      totalFeeCharge: Schema.optional(InrMoney),
      totalPenaltyCharge: Schema.optional(InrMoney),
      availableBalance: Schema.optional(InrMoney),
    }),
  ),
  transactions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id,
        accountId: Schema.optional(id),
        accountNo: Schema.optional(Schema.String),
        currency: Schema.optional(
          Schema.Struct({ code: Schema.String, decimalPlaces: Schema.Number }),
        ),
        date: CoreDateEvidence,
        amount: InrMoney.pipe(Schema.nonNegative()),
        entryType: Schema.optional(
          Schema.NullOr(Schema.Literal("CREDIT", "DEBIT")),
        ),
        reversed: Schema.optional(Schema.Boolean),
        transactionType: Schema.Struct({
          value: Schema.optional(Schema.String),
          deposit: Schema.optional(Schema.Boolean),
          withdrawal: Schema.optional(Schema.Boolean),
        }),
      }),
    ).pipe(
      Schema.filter(
        (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
      ),
    ),
  ),
}).pipe(
  Schema.filter((account) =>
    (account.transactions ?? []).every(
      (row) =>
        (row.accountId === undefined || row.accountId === account.id) &&
        (row.accountNo === undefined || row.accountNo === account.accountNo) &&
        (row.currency === undefined ||
          (row.currency.code === account.currency?.code &&
            row.currency.decimalPlaces === account.currency?.decimalPlaces)),
    ),
  ),
);
const command = Schema.Struct({
  id: Schema.String,
  bank_id: Schema.String,
  key: Schema.String,
  kind: Schema.Literal(
    "deposit",
    "withdrawal",
    "transfer",
    "salary",
    "freeze",
    "unfreeze",
    "reverse",
  ),
  status: Schema.Literal(
    "pending",
    "executing",
    "posted",
    "failed",
    "uncertain",
    "rejected",
  ),
  amount_minor: count,
  description: Schema.String,
  maker: Schema.Literal("customer", "officer", "approver"),
  approver: Schema.NullOr(Schema.String),
  core_id: Schema.NullOr(Schema.Number),
  account_id: Schema.Number,
  payload: Schema.String,
  error: Schema.NullOr(Schema.String),
  created_at: Schema.String,
});
export const BranchDayEnvelope = Schema.Struct({
  coverage: Schema.Struct({
    totalCustomers: Schema.Number,
    limit: Schema.Number,
    workflowLimited: Schema.Boolean,
  }),
  branchId: Schema.String,
  businessDate: Schema.String,
  observedAt: finite,
  truncated: Schema.Boolean,
  responsibilities: Schema.Array(
    Schema.Struct({
      command_id: Schema.String,
      owner: Schema.Literal("teller", "checker", "manager", "accountant"),
      version: Schema.Number,
      updated_at: Schema.String,
    }),
  ),
  relationships: Schema.Array(
    Schema.Struct({
      customer: Schema.Struct({
        id: Schema.String,
        branch_id: Schema.String,
        bank_id: Schema.String,
        reference: Schema.String,
        display_name: Schema.String,
        account_id: id,
        client_id: id,
        account_no: Schema.String,
        origin: Schema.String,
      }),
      account: Schema.NullOr(BranchAccountEvidence),
      error: Schema.NullOr(Schema.String),
      observedAt: finite,
      commands: Schema.Array(command),
      requests: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          kind: Schema.String,
          status: Schema.String,
          detail: Schema.String,
          delivery_status: Schema.optional(Schema.String),
          updated_by: Schema.optional(Schema.String),
          updated_at: Schema.optional(Schema.String),
        }),
      ),
      audit: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          created_at: Schema.String,
          actor: Schema.String,
          action: Schema.String,
          detail: Schema.String,
        }),
      ),
    }),
  ),
}).pipe(
  Schema.filter(
    (v) =>
      new Set(v.relationships.map((r) => r.customer.id)).size ===
        v.relationships.length &&
      new Set(v.relationships.map((r) => r.customer.account_id)).size ===
        v.relationships.length &&
      v.relationships.every(
        (r) =>
          r.customer.branch_id === v.branchId &&
          (!r.account ||
            (r.account.id === r.customer.account_id &&
              r.account.clientId === r.customer.client_id &&
              r.account.accountNo === r.customer.account_no)),
      ),
  ),
);
