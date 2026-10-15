import { Data, Schema } from "effect";

export class BankingError extends Data.TaggedError("BankingError")<{
  message: string;
  status: number;
  uncertain?: boolean;
}> {}
export type Role = "customer" | "officer" | "approver";
export const RoleSchema = Schema.Literal("customer", "officer", "approver");
export const moneyToMinor = (amount: number): number => {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 10000000 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
  ) {
    throw new BankingError({
      message:
        "Enter a positive amount with at most two decimal places (maximum ₹1 crore).",
      status: 400,
    });
  }
  return Math.round(amount * 100);
};
export const canApprove = (role: Role, maker: Role): boolean =>
  role === "approver" && maker !== "approver";
export type CommandKind =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "salary"
  | "freeze"
  | "unfreeze"
  | "reverse";
type CommandStatus =
  | "pending"
  | "executing"
  | "posted"
  | "failed"
  | "uncertain"
  | "rejected";
export interface Bank {
  id: string;
  status: string;
  customer_client: number;
  customer_account: number;
  recipient_client: number;
  recipient_account: number;
  employer_client: number;
  employer_account: number;
  created_at: string;
}
export interface Session {
  token_hash: string;
  bank_id: string;
  role: Role;
  expires_at: number;
}
export interface Account {
  id: number;
  accountNo: string;
  clientId: number;
  clientName: string;
  status: { id: number; value: string; active?: boolean };
  subStatus?: { value: string; blockDebit?: boolean; block?: boolean };
  summary?: {
    accountBalance: number;
    availableBalance?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
    totalInterestPosted?: number;
  };
  transactions?: CoreTransaction[];
  currency?: { code: string; decimalPlaces: number };
}
interface CoreTransaction {
  id: number;
  date: number[];
  amount: number;
  runningBalance?: number;
  reversed?: boolean;
  transactionType: { value: string; deposit?: boolean; withdrawal?: boolean };
  paymentDetailData?: { receiptNumber?: string };
  note?: string;
}
export interface BankingCommand {
  id: string;
  bank_id: string;
  key: string;
  kind: CommandKind;
  status: CommandStatus;
  amount_minor: number;
  description: string;
  maker: Role;
  approver: string | null;
  core_id: number | null;
  account_id: number;
  payload: string;
  error: string | null;
  created_at: string;
}
export interface Beneficiary {
  id: string;
  bank_id: string;
  name: string;
  account_id: number;
  account_no: string;
  status: string;
  created_at: string;
}
export interface Application {
  id: string;
  bank_id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  employment: string;
  status: string;
  review_note: string | null;
  maker: Role;
  created_at: string;
}
export interface Audit {
  id: string;
  bank_id: string;
  actor: string;
  action: string;
  detail: string;
  created_at: string;
}
export interface ServiceRequest {
  id: string;
  bank_id: string;
  kind: string;
  detail: string;
  status: string;
  created_at: string;
}
export interface DocumentRecord {
  id: string;
  bank_id: string;
  name: string;
  kind: string;
  object_key: string;
  size: number;
  created_at: string;
}
export const dateFields = () => ({ locale: "en", dateFormat: "yyyy-MM-dd" });
export const bankingDate = (instant: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
export const formatMoney = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
