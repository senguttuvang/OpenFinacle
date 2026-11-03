import { expect, test } from "bun:test";
import {
  filterLoanWork,
  type LoanWorkFilters,
  loanWorkOptions,
} from "../../src/platform/branch-operations/domain/loan-work";
import type { LoanExposure } from "../../src/platform/branch-operations/domain/loans";

const currency = { code: "INR" as const, decimalPlaces: 2 as const };
const summary = (overdue: number) => ({
  currency,
  principalOutstanding: 100,
  interestOutstanding: 5,
  feeChargesOutstanding: 0,
  penaltyChargesOutstanding: 0,
  totalOutstanding: 105,
  totalOverdue: overdue,
});
const rows: LoanExposure["rows"] = [
  {
    customerId: "owned-one",
    customerName: "Mira Rao",
    loan: {
      id: 7,
      accountNo: "ADV-007",
      clientId: 52,
      loanProductId: 3,
      loanProductName: "Working capital",
      currency,
      status: { id: 300, value: "Active" },
      principal: 100,
      summary: summary(25),
    },
  },
  {
    customerId: "owned-two",
    customerName: "Mira Business",
    loan: {
      id: 8,
      accountNo: "ADV-008",
      clientId: 61,
      loanProductId: 4,
      loanProductName: "Working capital",
      currency,
      status: { id: 400, value: "Withdrawn" },
      principal: 100,
      summary: summary(0),
    },
  },
  {
    customerId: "owned-three",
    customerName: "Nila",
    loan: {
      id: 9,
      accountNo: "ADV-009",
      clientId: 72,
      loanProductId: 3,
      currency,
      status: { id: 300 },
      principal: 100,
    },
  },
  {
    customerId: "owned-four",
    customerName: "Arun",
    loan: {
      id: 10,
      accountNo: "ADV-010",
      clientId: 81,
      loanProductId: 4,
      currency,
      status: { id: 300 },
      principal: 100,
      summary: null,
    },
  },
];
const filters: LoanWorkFilters = {
  query: "",
  product: "",
  state: "",
  evidence: "all",
};
const ids = (selection: LoanWorkFilters) =>
  filterLoanWork(rows, selection).map((r) => r.loan.id);
test("native overdue, explicit zero and missing evidence stay separate", () => {
  expect(ids({ ...filters, evidence: "overdue" })).toEqual([7]);
  expect(ids({ ...filters, evidence: "zero" })).toEqual([8]);
  expect(ids({ ...filters, evidence: "missing" })).toEqual([9, 10]);
  expect(ids(filters)).toEqual([7, 8, 9, 10]);
});
test("customer/reference, exact product IDs and native state compose", () => {
  expect(
    ids({
      ...filters,
      query: "  MIRA ",
      product: "3",
      state: "300",
      evidence: "overdue",
    }),
  ).toEqual([7]);
  expect(
    ids({ ...filters, query: "Mira", product: "4", state: "300" }),
  ).toEqual([]);
  expect(ids({ ...filters, query: "adv-008" })).toEqual([8]);
  expect(ids({ ...filters, query: "72" })).toEqual([9]);
  expect(ids({ ...filters, query: "owned-four" })).toEqual([10]);
  expect(ids({ ...filters, product: "30" })).toEqual([]);
});
test("same product names never collapse distinct native product identities", () => {
  const options = loanWorkOptions(rows);
  expect(options.products.map(([id]) => id)).toEqual([3, 4]);
  expect(options.states.map(([id]) => id)).toEqual([300, 400]);
  expect(ids({ ...filters, product: "4" })).toEqual([8, 10]);
});
test("filters preserve original source identity and do not mutate financial evidence", () => {
  const before = JSON.stringify(rows);
  const selected = filterLoanWork(rows, { ...filters, evidence: "overdue" });
  expect(selected[0]).toBe(rows[0]);
  expect(JSON.stringify(rows)).toBe(before);
  expect(filterLoanWork([], filters)).toEqual([]);
});
