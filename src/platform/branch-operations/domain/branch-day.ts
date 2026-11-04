import type {
  Account,
  Audit,
  BankingCommand,
  ServiceRequest,
} from "../../banking-workspace/domain/banking";
import type { RegisteredCustomer } from "../../customers/domain/customer-registry";
import { inrMinor, safeMinorTotal } from "./inr-money";

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
function hasCompleteCoverage(day: BranchDay) {
  return (
    coreDate(day.businessDate.split("-").map(Number)) === day.businessDate &&
    !day.truncated &&
    !day.coverage.workflowLimited &&
    Number.isSafeInteger(day.coverage.totalCustomers) &&
    day.coverage.totalCustomers === day.relationships.length &&
    Number.isSafeInteger(day.coverage.limit) &&
    day.coverage.limit > 0 &&
    day.relationships.length <= day.coverage.limit &&
    day.relationships.length > 0
  );
}

export function branchTotals(day: BranchDay) {
  let balance = 0n;
  let credits = 0n;
  let debits = 0n;
  const accountIds = new Set<number>(),
    transactionIds = new Set<number>();
  let complete = hasCompleteCoverage(day);
  for (const { account, customer } of day.relationships) {
    const ledger = inrMinor(account?.summary?.accountBalance);
    if (
      !account ||
      !Number.isSafeInteger(account.id) ||
      account.id <= 0 ||
      accountIds.has(account.id) ||
      customer.branch_id !== day.branchId ||
      account.id !== customer.account_id ||
      account.clientId !== customer.client_id ||
      account.accountNo !== customer.account_no ||
      account.currency?.code !== "INR" ||
      account.currency.decimalPlaces !== 2 ||
      ledger === null ||
      [
        account.summary?.availableBalance,
        account.summary?.totalInterestPosted,
        account.summary?.totalFeeCharge,
        account.summary?.totalPenaltyCharge,
      ].some((value) => value !== undefined && inrMinor(value) === null)
    ) {
      complete = false;
      continue;
    }
    accountIds.add(account.id);
    balance += BigInt(ledger);
    if (!account.transactions) complete = false;
    for (const item of account.transactions ?? []) {
      const minor = inrMinor(item.amount);
      const date = coreDate(item.date);
      if (
        date === "Unknown" ||
        minor === null ||
        minor < 0 ||
        !Number.isSafeInteger(item.id) ||
        item.id <= 0 ||
        transactionIds.has(item.id) ||
        (item.accountId !== undefined && item.accountId !== account.id) ||
        (item.accountNo !== undefined &&
          item.accountNo !== account.accountNo) ||
        (item.currency !== undefined &&
          (item.currency.code !== "INR" || item.currency.decimalPlaces !== 2))
      ) {
        complete = false;
        continue;
      }
      transactionIds.add(item.id);
      if (date !== day.businessDate) continue;
      if (item.reversed === true) continue;
      if (
        item.reversed !== false ||
        (item.entryType !== "CREDIT" && item.entryType !== "DEBIT")
      ) {
        complete = false;
        continue;
      }
      if (item.entryType === "CREDIT") credits += BigInt(minor);
      else debits += BigInt(minor);
    }
  }
  const balanceMinor = safeMinorTotal(balance),
    creditsMinor = safeMinorTotal(credits),
    debitsMinor = safeMinorTotal(debits);
  complete =
    complete &&
    balanceMinor !== null &&
    creditsMinor !== null &&
    debitsMinor !== null;
  return { balanceMinor, creditsMinor, debitsMinor, complete };
}

export function branchDepositProducts(day: BranchDay) {
  const products = new Map<number, { name: string; minor: bigint }>();
  let complete = branchTotals(day).complete;
  for (const { account } of day.relationships) {
    const minor = inrMinor(account?.summary?.accountBalance),
      id = account?.savingsProductId;
    if (
      account?.currency?.code !== "INR" ||
      account.currency.decimalPlaces !== 2 ||
      minor === null ||
      id === undefined ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      complete = false;
      continue;
    }
    const previous = products.get(id);
    products.set(id, {
      name:
        previous?.name ?? account.savingsProductName ?? `Core product ${id}`,
      minor: (previous?.minor ?? 0n) + BigInt(minor),
    });
  }
  const rows = [...products].map(([id, value]) => ({
    id,
    name: value.name,
    balanceMinor: safeMinorTotal(value.minor),
  }));
  return {
    complete: complete && rows.every((r) => r.balanceMinor !== null),
    products: rows,
  };
}
