import { expect, test } from "bun:test";
import { Schema } from "effect";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import {
  branchDepositProducts,
  branchTotals,
} from "../../../src/platform/branch-operations/domain/branch-day";
import {
  BranchAccountEvidence,
  BranchDayEnvelope,
} from "../../../src/platform/branch-operations/domain/core-account";

const setup = () => {
  const day = branchDayFixture();
  day.reviewFixture = false;
  for (const r of day.relationships) {
    if (!r.account?.summary) throw new Error("Missing synthetic account");
    r.account.summary.accountBalance = 0;
    r.account.transactions = [];
  }
  const account = day.relationships[0].account;
  if (!account?.summary) throw new Error("Missing synthetic account");
  const summary = account.summary;
  const otherSummary = day.relationships[1].account?.summary;
  if (!summary || !otherSummary) throw new Error("Missing account summaries");
  return { day, account, summary, otherSummary };
};
test("fractional-paise native ledger evidence is withheld, never rounded into a complete total", () => {
  const { day, account, summary } = setup();
  summary.accountBalance = 1.001;
  expect(branchTotals(day).complete).toBe(false);
  expect(Schema.is(BranchAccountEvidence)(account)).toBe(false);
  expect(Schema.is(BranchDayEnvelope)(day)).toBe(false);
});
test("explicit zero and valid negative native ledger values remain exact", () => {
  const { day, account, summary } = setup();
  expect(branchTotals(day)).toMatchObject({ balanceMinor: 0, complete: true });
  summary.accountBalance = -25.5;
  expect(branchTotals(day)).toMatchObject({
    balanceMinor: -2550,
    complete: true,
  });
  expect(Schema.is(BranchAccountEvidence)(account)).toBe(true);
});
test("native credit/debit entry type includes interest and fees without guessing from deposit flags", () => {
  const { day, account } = setup();
  account.transactions = [
    {
      id: 1,
      date: [2026, 11, 3],
      amount: 0.1,
      reversed: false,
      entryType: "CREDIT",
      transactionType: { value: "Interest posting" },
    },
    {
      id: 2,
      date: [2026, 11, 3],
      amount: 0.2,
      reversed: false,
      entryType: "CREDIT",
      transactionType: { value: "Other native credit" },
    },
    {
      id: 3,
      date: [2026, 11, 3],
      amount: 1.25,
      reversed: false,
      entryType: "DEBIT",
      transactionType: { value: "Fee deduction" },
    },
  ];
  expect(branchTotals(day)).toMatchObject({
    creditsMinor: 30,
    debitsMinor: 125,
    complete: true,
  });
});
test("missing native direction or reversal does not become zero activity; known reversed records remain excluded", () => {
  const { day, account } = setup();
  const transaction = {
    id: 1,
    date: [2026, 11, 3],
    amount: 5,
    transactionType: { value: "Deposit", deposit: true },
  };
  account.transactions = [{ ...transaction, reversed: false }];
  expect(branchTotals(day).complete).toBe(false);
  account.transactions = [{ ...transaction, entryType: "CREDIT" }];
  expect(branchTotals(day).complete).toBe(false);
  account.transactions = [{ ...transaction, reversed: true }];
  expect(branchTotals(day)).toMatchObject({ creditsMinor: 0, complete: true });
});
test("unsafe aggregate sums are withheld and signed cancellation stays exact", () => {
  const { day, summary, otherSummary } = setup();
  summary.accountBalance = 60000000000000;
  otherSummary.accountBalance = 60000000000000;
  const overflow = branchTotals(day);
  expect(overflow.complete).toBe(false);
  expect(overflow.balanceMinor).toBeNull();
  otherSummary.accountBalance = -60000000000000;
  expect(branchTotals(day)).toMatchObject({ balanceMinor: 0, complete: true });
});

test("all displayed native monetary fields reject nonfinite, unsafe or fractional-paise values", () => {
  for (const field of [
    "accountBalance",
    "availableBalance",
    "totalInterestPosted",
    "totalFeeCharge",
    "totalPenaltyCharge",
  ]) {
    for (const value of [1.001, NaN, Infinity, 100000000000000]) {
      const { day, account, summary } = setup();
      const malformed = {
        ...account,
        summary: { ...summary, [field]: value },
      };
      day.relationships[0].account = malformed;
      expect(Schema.is(BranchAccountEvidence)(malformed)).toBe(false);
      expect(branchTotals(day).complete).toBe(false);
    }
  }
});
test("malformed, foreign or duplicated transaction identity/currency/amount is withheld", () => {
  const { day, account } = setup();
  const row = {
    id: 1,
    date: [2026, 11, 3],
    amount: 1.25,
    reversed: false,
    entryType: "CREDIT" as const,
    transactionType: { value: "Deposit" },
  };
  for (const patch of [
    { amount: 0.001 },
    { amount: -1 },
    { amount: Infinity },
    { id: 1.5 },
    { id: 0 },
    { accountId: 99999 },
    { accountNo: "foreign" },
    { currency: { code: "USD", decimalPlaces: 2 } },
  ]) {
    account.transactions = [{ ...row, ...patch }];
    expect(branchTotals(day).complete).toBe(false);
    expect(Schema.is(BranchAccountEvidence)(account)).toBe(false);
  }
  account.transactions = [row, row];
  expect(branchTotals(day).complete).toBe(false);
  expect(Schema.is(BranchAccountEvidence)(account)).toBe(false);
});
test("account/client/branch ownership and declared coverage are independently checked before aggregation", () => {
  for (const patch of [
    { id: 999999 },
    { clientId: 999999 },
    { accountNo: "foreign" },
  ]) {
    const { day, account } = setup();
    day.relationships[0].account = { ...account, ...patch };
    expect(branchTotals(day).complete).toBe(false);
    expect(Schema.is(BranchDayEnvelope)(day)).toBe(false);
  }
  const { day } = setup();
  day.coverage.totalCustomers = 3;
  expect(branchTotals(day).complete).toBe(false);
  day.coverage.totalCustomers = 2;
  day.relationships[0].customer.branch_id = "foreign";
  expect(branchTotals(day).complete).toBe(false);
  expect(Schema.is(BranchDayEnvelope)(day)).toBe(false);
});
test("credit/debit overflow remains unavailable rather than an unsafe number", () => {
  const { day, account } = setup();
  account.transactions = Array.from({ length: 2 }, (_, i) => ({
    id: i + 1,
    date: [2026, 11, 3],
    amount: 60000000000000,
    reversed: false,
    entryType: "CREDIT",
    transactionType: { value: "Native credit" },
  }));
  expect(branchTotals(day)).toMatchObject({
    creditsMinor: null,
    complete: false,
  });
});
test("native product IDs keep equal names separate and product subtotal overflow is withheld", () => {
  const { day, summary, otherSummary } = setup();
  summary.accountBalance = 1.25;
  otherSummary.accountBalance = 2.5;
  const other = day.relationships[1].account;
  if (!other) throw new Error("Missing other account");
  other.savingsProductId = 2;
  const products = branchDepositProducts(day);
  expect(products.complete).toBe(true);
  expect(products.products.map((p) => [p.id, p.balanceMinor])).toEqual([
    [1, 125],
    [2, 250],
  ]);
  summary.accountBalance = 60000000000000;
  otherSummary.accountBalance = 60000000000000;
  other.savingsProductId = 1;
  expect(branchDepositProducts(day)).toMatchObject({
    complete: false,
    products: [{ id: 1, balanceMinor: null }],
  });
  other.savingsProductId = undefined;
  expect(branchDepositProducts(day).complete).toBe(false);
});
