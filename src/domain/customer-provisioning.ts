import { Context, type Effect } from "effect";
import type { BankingError } from "./banking";

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

const firstnames = [
  "Aadhya",
  "Aravind",
  "Diya",
  "Kabir",
  "Kavya",
  "Meera",
  "Nikhil",
  "Priya",
  "Rohan",
  "Zoya",
];
const lastnames = [
  "Iyer",
  "Menon",
  "Patel",
  "Raman",
  "Shah",
  "Nair",
  "Rao",
  "Das",
  "Kapoor",
  "Sen",
];
export const syntheticCustomers = (branchId: string): SeedCustomer[] =>
  Array.from({ length: 99 }, (_, index) => ({
    id: `sample-${branchId}-${String(index + 1).padStart(3, "0")}`,
    branch_id: branchId,
    ordinal: index + 1,
    reference: `SYN-${branchId}-${String(index + 1).padStart(3, "0")}`,
    firstname: firstnames[index % 10],
    lastname: lastnames[Math.floor(index / 10)],
    funding_minor: (15000 + ((index * 7919) % 185000)) * 100,
    client_id: null,
    account_id: null,
    account_no: null,
  }));
