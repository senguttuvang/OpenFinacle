import { expect, test } from "bun:test";
import { Schema } from "effect";
import { branchDayFixture } from "../../src/demo/branch/branch-day-fixture";
import {
  branchTotals,
  coreDate,
} from "../../src/platform/branch-operations/domain/branch-day";
import {
  BranchDayEnvelope,
  CoreDateEvidence,
} from "../../src/platform/branch-operations/domain/core-account";

test("impossible calendar dates withhold daily totals rather than silently excluding transactions", () => {
  expect(coreDate([2024, 2, 29])).toBe("2024-02-29");
  for (const invalid of [
    [],
    [2026, 1],
    [2025, 2, 29],
    [2026, 4, 31],
    [2026, 0, 1],
    [2026, 13, 1],
    [2026, 1, 0],
    [2026, 1, 1.5],
    [10000, 1, 1],
    [2026, 1, Infinity],
  ]) {
    expect(coreDate(invalid)).toBe("Unknown");
    expect(Schema.decodeUnknownEither(CoreDateEvidence)(invalid)._tag).toBe(
      "Left",
    );
  }
  const day = branchDayFixture();
  const account = day.relationships[0].account;
  if (!account) throw new Error("Fixture account unavailable");
  expect(branchTotals(day).complete).toBe(true);
  account.transactions = [
    {
      id: 999,
      date: [2025, 2, 29],
      amount: 100,
      reversed: false,
      transactionType: { value: "Deposit", deposit: true },
    },
  ];
  expect(branchTotals(day).complete).toBe(false);
  expect(Schema.decodeUnknownEither(BranchDayEnvelope)(day)._tag).toBe("Left");
  account.transactions = [];
  day.businessDate = "2026-99-03";
  expect(branchTotals(day).complete).toBe(false);
});
test("service delivery metadata rejects malformed values but preserves missing and unknown text states", () => {
  const day = branchDayFixture();
  const relationship = day.relationships[0];
  const request = {
    id: "metadata-case",
    bank_id: relationship.customer.bank_id,
    kind: "chequebook",
    status: "fulfilled",
    detail: "Synthetic case",
    created_at: "2026-11-04",
  };
  relationship.requests = [request];
  expect(Schema.decodeUnknownEither(BranchDayEnvelope)(day)._tag).toBe("Right");
  expect(
    Schema.decodeUnknownEither(BranchDayEnvelope)({
      ...day,
      relationships: [
        {
          ...relationship,
          requests: [{ ...request, delivery_status: { unverified: true } }],
        },
      ],
    })._tag,
  ).toBe("Left");
  relationship.requests = [
    {
      ...request,
      delivery_status: "future_unverified_status",
      updated_by: "officer",
      updated_at: "2026-11-04",
    },
  ];
  expect(Schema.decodeUnknownEither(BranchDayEnvelope)(day)._tag).toBe("Right");
});
