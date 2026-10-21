import { Context, type Effect } from "effect";
import type { BankingError } from "../../banking-workspace/domain/banking";

export interface SeedCustomer {
  id: string;
  branch_id: string;
  ordinal: number;
  reference: string;
  firstname: string;
  lastname: string;
  funding_minor: number;
  client_id: number | null;
  account_id: number | null;
  account_no: string | null;
}
export type SeedStage = "client" | "account" | "approve" | "activate" | "fund";
export interface SeedOperation {
  seed_id: string;
  stage: SeedStage;
  command_key: string;
  payment_date: string;
  status: "executing" | "uncertain" | "confirmed" | "failed";
  resource_id: number | null;
}
export interface SeedProof {
  resource_id: number;
  client_id?: number;
  account_id?: number;
  account_no?: string;
}
export interface CustomerProvisionerService {
  dispatch: (
    customer: SeedCustomer,
    operation: SeedOperation,
  ) => Effect.Effect<SeedProof, BankingError>;
  inspect: (
    customer: SeedCustomer,
    operation: SeedOperation,
  ) => Effect.Effect<SeedProof, BankingError>;
}
export const CustomerProvisioner =
  Context.GenericTag<CustomerProvisionerService>(
    "OpenFinacle/CustomerProvisioner",
  );
