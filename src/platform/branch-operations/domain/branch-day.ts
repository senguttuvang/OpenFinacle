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
export const coreDate = (date: readonly number[]) => {
  if (date.length !== 3 || !date.every(Number.isSafeInteger)) return "Unknown";
  const [year, month, day] = date;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31)
    return "Unknown";
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    return "Unknown";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
export function branchTotals(day: BranchDay) {
  let balanceMinor = 0;
  let creditsMinor = 0;
  let debitsMinor = 0;
  let complete =
    coreDate(day.businessDate.split("-").map(Number)) === day.businessDate &&
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
      if (item.reversed) continue;
      const date = coreDate(item.date);
      if (date === "Unknown") {
        complete = false;
        continue;
      }
      if (date !== day.businessDate) continue;
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
