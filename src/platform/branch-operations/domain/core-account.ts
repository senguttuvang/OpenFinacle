import { Schema } from "effect";
import { coreDate } from "./branch-day";
export const CoreDateEvidence = Schema.Array(Schema.Number).pipe(
  Schema.filter((date) => coreDate(date) !== "Unknown"),
);

const finite = Schema.Number.pipe(Schema.finite());
export const BranchAccountEvidence = Schema.Struct({
  nominalAnnualInterestRate: Schema.optional(finite),
  savingsProductId: Schema.optional(Schema.Number),
  savingsProductName: Schema.optional(Schema.String),
  clientOfficeId: Schema.optional(Schema.Number),
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
  id: Schema.Number,
  accountNo: Schema.String,
  clientId: Schema.Number,
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
      accountBalance: finite,
      totalInterestPosted: Schema.optional(finite),
      totalFeeCharge: Schema.optional(finite),
      totalPenaltyCharge: Schema.optional(finite),
      availableBalance: Schema.optional(finite),
    }),
  ),
  transactions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.Number,
        date: CoreDateEvidence,
        amount: finite,
        reversed: Schema.optional(Schema.Boolean),
        transactionType: Schema.Struct({
          value: Schema.optional(Schema.String),
          deposit: Schema.optional(Schema.Boolean),
          withdrawal: Schema.optional(Schema.Boolean),
        }),
      }),
    ),
  ),
});
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
  amount_minor: finite,
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
        account_id: Schema.Number,
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
});
