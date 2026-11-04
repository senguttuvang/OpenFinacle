import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { Session } from "../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { readAccounting } from "../../src/platform/branch-operations/application/accounting";
import { branchCustomer } from "../../src/platform/branch-operations/application/branch-day";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
async function setup() {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer: Session = { ...source, role: "officer" };
  const { customer } = await harness.run(
    h,
    branchCustomer(officer, recipientId),
  );
  const row = {
    id: 81,
    officeId: 1,
    glAccountId: 2,
    glAccountName: "Deposits",
    glAccountCode: "OF2001",
    transactionId: "provider-label-only",
    transactionDate: [2026, 11, 4],
    entryType: { id: 1, value: "CREDIT" },
    amount: 125.25,
    currency: { code: "INR", decimalPlaces: 2 },
    entityId: customer.account_id,
    entityType: { id: 2, value: "SAVING" },
    transactionDetails: { transactionId: 387 },
  };
  let page: unknown = { totalFilteredRecords: 1, pageItems: [row] },
    productId = 1;
  const calls: string[] = [];
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string) => {
      calls.push(`${method} ${path}`);
      const result = path.startsWith("savingsaccounts/")
        ? {
            id: customer.account_id,
            clientId: customer.client_id,
            savingsProductId: 1,
          }
        : path === "glaccounts"
          ? [{ id: 2, name: "Deposits", glCode: "OF2001" }]
          : path.startsWith("journalentries?")
            ? page
            : {
                id: productId,
                name: "Savings",
                accountingRule: { id: 2, value: "Cash based" },
              };
      return Effect.succeed(result as T);
    },
  });
  return {
    row,
    calls,
    page: (v: unknown) => {
      page = v;
    },
    product: (id: number) => {
      productId = id;
    },
    read: (offset = 0) =>
      harness.run(
        h,
        readAccounting(officer, recipientId, offset).pipe(Effect.provide(core)),
      ),
  };
}
for (const [name, patch] of [
  ["foreign currency", { currency: { code: "USD" } }],
  ["fractional paise", { amount: 0.001 }],
  ["negative amount", { amount: -1 }],
  ["nonfinite amount", { amount: Number.POSITIVE_INFINITY }],
  ["unsafe money", { amount: Number.MAX_SAFE_INTEGER }],
  ["fractional journal identity", { id: 1.5 }],
  ["invalid GL identity", { glAccountId: 0 }],
  ["invalid office identity", { officeId: -1 }],
  [
    "unsafe native transaction identity",
    { transactionDetails: { transactionId: Number.MAX_SAFE_INTEGER + 1 } },
  ],
  ["unsupported entry type", { entryType: { id: 9, value: "Unknown" } }],
] as const) {
  test(`savings journals withhold ${name}`, async () => {
    const s = await setup();
    s.page({ totalFilteredRecords: 1, pageItems: [{ ...s.row, ...patch }] });
    const result = await s.read();
    expect(result.journals).toBeNull();
    expect(result.coverage.hasMore).toBe(false);
    expect(result.errors).not.toHaveLength(0);
    expect(s.calls.every((c) => c.startsWith("GET "))).toBe(true);
  });
}
test("duplicate identities and inconsistent reported coverage cannot imply complete savings evidence", async () => {
  const s = await setup();
  for (const page of [
    { totalFilteredRecords: 2, pageItems: [s.row, s.row] },
    { totalFilteredRecords: 2.5, pageItems: [s.row] },
    { totalFilteredRecords: 201, pageItems: [s.row] },
    { totalFilteredRecords: 0, pageItems: [s.row] },
  ]) {
    s.page(page);
    const result = await s.read();
    expect(result.journals).toBeNull();
    expect(result.coverage.hasMore).toBe(false);
  }
});
test("valid provider pagination counts counterparts before excluding them", async () => {
  const s = await setup();
  s.page({
    totalFilteredRecords: 202,
    pageItems: Array.from({ length: 200 }, (_, i) => ({
      ...s.row,
      id: i + 1,
      ...(i === 199 ? { entityType: { id: 1, value: "LOAN" } } : {}),
    })),
  });
  const first = await s.read();
  expect(first.journals?.pageItems).toHaveLength(199);
  expect(first.coverage).toEqual({
    offset: 0,
    limit: 200,
    sourceRows: 200,
    excludedRows: 1,
    hasMore: true,
  });
  s.page({
    totalFilteredRecords: 202,
    pageItems: [
      { ...s.row, id: 201 },
      { ...s.row, id: 202 },
    ],
  });
  const last = await s.read(200);
  expect(last.journals?.pageItems).toHaveLength(2);
  expect(last.coverage.hasMore).toBe(false);
  expect(s.calls.some((c) => c.includes("offset=200"))).toBe(true);
});
test("wrong product identity is withheld without inventing a journal association", async () => {
  const s = await setup();
  s.product(99);
  const result = await s.read();
  expect(result.product).toBeNull();
  expect(result.journals?.pageItems[0].transactionDetails?.transactionId).toBe(
    387,
  );
  expect(result.errors).toContain(
    "Core savings product identity differs. Product mapping withheld.",
  );
});

test("chart and product GL references reject ambiguous or invalid identities", async () => {
  const { Schema } = await import("effect");
  const { GlChart, ProductAccounting } = await import(
    "../../src/platform/branch-operations/domain/accounting"
  );
  expect(
    Schema.is(GlChart)([
      { id: 2, name: "A", glCode: "A" },
      { id: 2, name: "B", glCode: "B" },
    ]),
  ).toBe(false);
  expect(Schema.is(GlChart)([{ id: 0, name: "A", glCode: "A" }])).toBe(false);
  expect(
    Schema.is(ProductAccounting)({
      id: 1,
      name: "Savings",
      accountingRule: { id: 2, value: "Cash" },
      accountingMappings: {
        savingsControlAccount: { id: -1, name: "Invalid" },
      },
    }),
  ).toBe(false);
});

test("savings journal reads retain native computation evidence but never expose stored running balances", async () => {
  const s = await setup();
  for (const runningBalanceComputed of [false, true, null, undefined]) {
    s.page({
      totalFilteredRecords: 1,
      pageItems: [
        {
          ...s.row,
          runningBalanceComputed,
          officeRunningBalance: 0,
          organizationRunningBalance: 100000000000000000000,
        },
      ],
    });
    const value = await s.read();
    const row = value.journals?.pageItems[0];
    expect(row).toBeDefined();
    expect(row?.runningBalanceComputed).toBe(runningBalanceComputed);
    expect(row && "officeRunningBalance" in row).toBe(false);
    expect(row && "organizationRunningBalance" in row).toBe(false);
  }
  expect(
    s.calls
      .filter((c) => c.includes("journalentries?"))
      .every((c) => c.includes("runningBalance=true")),
  ).toBe(true);
  expect(s.calls.every((c) => c.startsWith("GET "))).toBe(true);
  for (const patch of [
    { currency: { code: "INR" } },
    { currency: { code: "INR", decimalPlaces: 3 } },
    { entryType: { id: 1, value: "DEBIT" } },
    { runningBalanceComputed: "false" },
  ]) {
    s.page({ totalFilteredRecords: 1, pageItems: [{ ...s.row, ...patch }] });
    expect((await s.read()).journals).toBeNull();
  }
});
