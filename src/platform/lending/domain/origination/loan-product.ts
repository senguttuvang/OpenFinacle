import { Context, type Effect, Schema } from "effect";
import type { BankingError } from "../../../banking-workspace/domain/banking";

export const LoanLedgerCode = Schema.Literal(
  "OF1002",
  "OF1003",
  "OF2003",
  "OF4002",
  "OF5002",
);
export type LoanLedgerCode = typeof LoanLedgerCode.Type;
export const loanLedgerDefinitions = [
  { code: "OF1002", name: "Loan portfolio", kind: "asset" },
  { code: "OF1003", name: "Loan transfer suspense", kind: "asset" },
  { code: "OF2003", name: "Loan overpayments", kind: "liability" },
  { code: "OF4002", name: "Loan income", kind: "income" },
  { code: "OF5002", name: "Loan loss and adjustments", kind: "expense" },
] as const;
export const LoanSetupStep = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("account"), code: LoanLedgerCode }),
  Schema.Struct({ kind: Schema.Literal("product") }),
);
export type LoanSetupStep = typeof LoanSetupStep.Type;
export interface LoanCatalogueInventory {
  cash_id: number;
  clearing_id: number;
  accounts: Readonly<Record<LoanLedgerCode, number | null>>;
  product_id: number | null;
}
export interface LoanCatalogueService {
  inventory: () => Effect.Effect<LoanCatalogueInventory, BankingError>;
  // Caller must durably reserve this exact step/key before invoking a create.
  execute: (
    step: LoanSetupStep,
    key: string,
  ) => Effect.Effect<number, BankingError>;
}
export const LoanCatalogue = Context.GenericTag<LoanCatalogueService>(
  "OpenFinacle/LoanCatalogue",
);
