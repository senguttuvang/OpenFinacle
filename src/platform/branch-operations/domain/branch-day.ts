import type {
  Account,
  Audit,
  BankingCommand,
  ServiceRequest,
} from "../../banking-workspace/domain/banking";
import type { RegisteredCustomer } from "../../customers/domain/customer-registry";

export interface BranchAccount extends Account {
  interestCompoundingPeriodType?: { id: number; value: string };
  interestPostingPeriodType?: { id: number; value: string };
  interestCalculationType?: { id: number; value: string };
  interestCalculationDaysInYearType?: { id: number; value: string };
  withdrawalFeeForTransfers?: boolean;
  allowOverdraft?: boolean;
  enforceMinRequiredBalance?: boolean;
  withHoldTax?: boolean;
  summary?: NonNullable<Account["summary"]> & {
    totalFeeCharge?: number;
    totalPenaltyCharge?: number;
  };
  savingsProductId?: number;
  savingsProductName?: string;
  nominalAnnualInterestRate?: number;
  clientOfficeId?: number;
  clientOfficeName?: string;
}
export interface BranchRelationship {
  customer: RegisteredCustomer;
  account: BranchAccount | null;
  error: string | null;
  commands: BankingCommand[];
  requests: (ServiceRequest & {
    delivery_status?: string;
    updated_by?: string;
    updated_at?: string;
  })[];
  audit: Audit[];
  observedAt: number;
}
export interface Responsibility {
  command_id: string;
  owner: "teller" | "checker" | "manager" | "accountant";
  version: number;
  updated_at: string;
}
export const branchCustomerLimit = 200;
export interface BranchDay {
  coverage: { totalCustomers: number; limit: number; workflowLimited: boolean };
  reviewFixture?: boolean;
  branchId: string;
  businessDate: string;
  observedAt: number;
  relationships: BranchRelationship[];
  responsibilities: Responsibility[];
  truncated: boolean;
}
export const unresolvedStatuses = new Set([
  "pending",
  "executing",
  "uncertain",
  "failed",
]);
export const coreDate = (date: number[]) =>
  date.length === 3
    ? `${date[0]}-${String(date[1]).padStart(2, "0")}-${String(date[2]).padStart(2, "0")}`
    : "Unknown";
export function branchTotals(day: BranchDay) {
  let balanceMinor = 0;
  let creditsMinor = 0;
  let debitsMinor = 0;
  let complete =
    !day.truncated &&
    !day.coverage.workflowLimited &&
    day.relationships.length > 0;
  for (const { account } of day.relationships) {
    if (
      !account ||
      account.currency?.code !== "INR" ||
      account.currency.decimalPlaces !== 2 ||
      !Number.isFinite(account.summary?.accountBalance)
    ) {
      complete = false;
      continue;
    }
    balanceMinor += Math.round((account.summary?.accountBalance ?? 0) * 100);
    if (!account.transactions) complete = false;
    for (const item of account.transactions ?? []) {
      if (item.reversed || coreDate(item.date) !== day.businessDate) continue;
      if (!Number.isFinite(item.amount) || item.amount < 0) {
        complete = false;
        continue;
      }
      if (item.transactionType.deposit)
        creditsMinor += Math.round(item.amount * 100);
      if (item.transactionType.withdrawal)
        debitsMinor += Math.round(item.amount * 100);
    }
  }
  return { balanceMinor, creditsMinor, debitsMinor, complete };
}
