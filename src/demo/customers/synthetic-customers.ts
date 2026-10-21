import type { SeedCustomer } from "../../platform/customers/domain/customer-provisioning";

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
