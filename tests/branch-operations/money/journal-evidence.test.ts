import { expect, test } from "bun:test";
import { Schema } from "effect";
import {
  InrJournalPage,
  JournalEntry,
} from "../../../src/platform/branch-operations/domain/accounting";

const row = {
  id: 1,
  officeId: 1,
  glAccountId: 1,
  glAccountName: "Synthetic cash",
  glAccountCode: "SYNTHETIC",
  transactionId: "SYNTHETIC-GROUP",
  transactionDate: [2026, 11, 4],
  entryType: { id: 1, value: "CREDIT" },
  amount: 12.34,
  currency: { code: "INR", decimalPlaces: 2 },
};
const valid = (patch: unknown) =>
  Schema.is(InrJournalPage)({
    totalFilteredRecords: 1,
    pageItems: [{ ...row, ...(patch as object) }],
  });
test("journal financial evidence requires reported INR2 precision and consistent native direction", () => {
  expect(valid({})).toBe(true);
  for (const currency of [
    { code: "INR" },
    { code: "INR", decimalPlaces: 3 },
    { code: "INR", decimalPlaces: 0 },
    { code: "INR", decimalPlaces: NaN },
    { code: "INR", decimalPlaces: Infinity },
    { code: "INR", decimalPlaces: 2.5 },
    { code: "USD", decimalPlaces: 2 },
  ])
    expect(valid({ currency })).toBe(false);
  expect(valid({ entryType: { id: 1, value: "DEBIT" } })).toBe(false);
  expect(valid({ entryType: { id: 2, value: "CREDIT" } })).toBe(false);
  expect(valid({ entryType: { id: 2, value: "DEBIT" } })).toBe(true);
});
test("native computation false/true/null/missing remain distinct while stored balances are stripped", () => {
  for (const runningBalanceComputed of [false, true, null, undefined]) {
    const value = Schema.decodeUnknownSync(JournalEntry)({
      ...row,
      runningBalanceComputed,
      officeRunningBalance: 777,
      organizationRunningBalance: 888,
    });
    expect(value).toMatchObject(
      runningBalanceComputed === undefined ? {} : { runningBalanceComputed },
    );
    expect("officeRunningBalance" in value).toBe(false);
    expect("organizationRunningBalance" in value).toBe(false);
  }
});
test("malformed native computation flags withhold the journal source rather than becoming unknown/false", () => {
  for (const runningBalanceComputed of ["false", 0, 1, {}, []])
    expect(valid({ runningBalanceComputed })).toBe(false);
});
