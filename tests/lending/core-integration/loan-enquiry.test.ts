import { expect, test } from "bun:test";
import { loanStatementCsv } from "../../../src/platform/lending/domain/origination/loan-statements";
import { loanRepaymentMarker } from "../../../src/platform/lending/domain/repayments/loan-repayment-identity";
import { createHarness } from "./loan-enquiry.harness";

const harness = createHarness();
test("full transfer uses a strict ISO calendar date while embedded transfer retains the legacy date array", async () => {
  const h = harness.harness();
  expect(await h.proof()).toMatchObject({
    transaction_id: 31,
    transfer_id: 51,
    date: "2026-10-17",
    amount_minor: 1200000,
  });
  expect(h.calls.every((call) => call.method === "GET")).toBe(true);
  for (const transferDate of [
    "2026-10-18",
    "2026-02-30",
    "2026-10-17T00:00:00Z",
    "17/10/2026",
    [2026, 10, 17],
    null,
    undefined,
  ]) {
    const rejected = harness.harness(harness.raw, {
      ...harness.transfer,
      transferDate,
    });
    const error = await rejected.denied(true);
    expect(error.uncertain).toBe(true);
    expect(rejected.calls.every((call) => call.method === "GET")).toBe(true);
  }
});

test("an explicit statement uses one owned read, preserves manual reversals and other Core types, and exports only normalized source facts", async () => {
  const disbursement = harness.statementRaw.transactions[0];
  const marker = loanRepaymentMarker("20000000-0000-4000-8000-000000000002");
  const h = harness.harness({
    ...harness.statementRaw,
    transactions: [
      {
        ...disbursement,
        transfer: {
          ...disbursement.transfer,
          transferDescription: "Independently invented private transfer note",
        },
      },
      {
        ...disbursement,
        id: 32,
        type: { id: 2 },
        date: [2026, 10, 18],
        amount: 1100,
        principalPortion: 1000,
        interestPortion: 100,
        manuallyReversed: true,
        reversedOnDate: [2026, 10, 19],
        transfer: {
          ...harness.basicTransfer,
          transferDate: [2026, 10, 18],
          transferAmount: 1100,
          reversed: true,
          transferDescription: marker,
        },
      },
      {
        ...disbursement,
        id: 33,
        type: { id: 77 },
        date: [2026, 10, 19],
        amount: 0,
        transfer: null,
      },
    ],
  });
  const result = await h.statement();
  expect(h.calls).toEqual([{ method: "GET", path: harness.loanPath }]);
  expect(result.statement?.transactions).toHaveLength(3);
  expect(result.statement?.transactions[1]).toMatchObject({
    type_id: 2,
    amount_minor: 110000,
    principal_minor: 100000,
    interest_minor: 10000,
    manually_reversed: true,
    reversed_on_date: "2026-10-19",
  });
  expect(result.statement?.repayment_minor).toBe(0);
  expect(
    result.statement?.transactions[0].transfer?.repayment_marker,
  ).toBeNull();
  expect(result.statement?.transactions[1].transfer?.repayment_marker).toBe(
    marker,
  );
  expect(JSON.stringify(result.statement)).not.toContain(
    "private transfer note",
  );
  if (!result.statement) throw new Error("Expected normalized statement");
  const csv = loanStatementCsv(
    result.statement,
    result.id,
    Date.UTC(2026, 9, 19),
    true,
  );
  expect(csv).toContain('"Stale saved observation"');
  expect(csv).toContain('"INR"');
  expect(csv).toContain(
    '"32","Repayment","2026-10-18","1100.00","1000.00","100.00"',
  );
  expect(csv).toContain('"33","Other Core transaction (type 77)"');
  expect(csv).not.toContain(harness.lookup.external_id);
  expect(csv).not.toContain(harness.external);
  expect(csv).toEndWith("\r\n");
});

test("statement ownership, completeness, exact components, dates and Core summary fail closed without affecting ordinary original proof", async () => {
  const row = harness.statementRaw.transactions[0];
  const invalid = [
    harness.raw,
    {
      ...harness.statementRaw,
      transactions: [
        {
          ...row,
          transfer: { ...harness.basicTransfer, transferAmount: 11000 },
        },
      ],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, type: { id: 2 }, amount: 0 }],
    },
    { ...harness.statementRaw, transactions: [] },
    { ...harness.statementRaw, transactions: [row, row] },
    { ...harness.statementRaw, transactions: [{ ...row, loanId: 99 }] },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, externalLoanId: "foreign-loan" }],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, currency: { code: "USD", decimalPlaces: 2 } }],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, principalPortion: undefined }],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, interestPortion: 0.001 }],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, feeChargesPortion: -1 }],
    },
    { ...harness.statementRaw, transactions: [{ ...row, type: { id: 3 } }] },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, date: [2026, 2, 30] }],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, date: [2026, 10, 16] }],
    },
    {
      ...harness.statementRaw,
      transactions: [{ ...row, reversedOnDate: [2026, 10, 18] }],
    },
    {
      ...harness.statementRaw,
      transactions: [
        row,
        {
          ...row,
          id: 32,
          type: { id: 2 },
          amount: 1100,
          principalPortion: 1000,
        },
      ],
    },
    {
      ...harness.statementRaw,
      summary: { ...harness.statementRaw.summary, totalRepayment: 1 },
    },
    {
      ...harness.statementRaw,
      summary: { ...harness.statementRaw.summary, interestOutstanding: 1199 },
    },
    {
      ...harness.statementRaw,
      summary: { ...harness.statementRaw.summary, feeChargesPaid: 1 },
    },
    {
      ...harness.statementRaw,
      transactions: Array.from({ length: 1001 }, (_, i) => ({
        ...row,
        id: i + 1,
      })),
    },
  ];
  for (const response of invalid) {
    const h = harness.harness(response);
    expect((await h.statementDenied()).status).toBe(503);
    expect(h.calls).toEqual([{ method: "GET", path: harness.loanPath }]);
  }
  expect(await harness.harness(harness.raw).proof()).toMatchObject({
    transaction_id: 31,
  });
});

test("read-only proof diagnostics select static schema checks and discard response values and transport messages", async () => {
  const marker = "invented-private-response-marker";
  const h = harness.harness({
    ...harness.raw,
    transactions: [
      {
        ...harness.transaction,
        manuallyReversed: marker,
        transfer: { ...harness.basicTransfer, currency: marker },
      },
    ],
  });
  const error = await h.denied(true);
  expect(error.loanProofChecks).toEqual(
    expect.arrayContaining([
      "loan-response-shape",
      "loan-transactions-shape",
      "transaction-reversal-shape",
      "transfer-summary-shape",
    ]),
  );
  expect(JSON.stringify(error)).not.toContain(marker);
  expect(h.calls).toHaveLength(1);
  expect(h.calls.every((call) => call.method === "GET")).toBe(true);
  const absent = harness.harness(
    harness.raw,
    harness.transfer,
    harness.loanPath,
  );
  expect((await absent.denied(true)).loanProofChecks).toEqual(["core-read"]);
  const foreign = harness.harness({ ...harness.raw, clientId: 999 });
  expect((await foreign.denied(true)).loanProofChecks).toEqual([
    "loan-ownership",
  ]);
});

test("owned loan enquiry normalizes core facts and schedules without quote expiry or any write", async () => {
  const h = harness.harness();
  const result = await h.inspect();
  expect(result).toMatchObject({
    id: 21,
    external_id: harness.lookup.external_id,
    owner: harness.lookup.owner,
    status: "active",
    principal_minor: 1200000,
    annual_rate_bps: 1200,
    expected_disbursement_date: "2026-10-17",
    actual_disbursement_date: "2026-10-17",
    principal_disbursed_minor: 1200000,
    principal_outstanding_minor: 1200000,
    outstanding_minor: 1320000,
    schedule: {
      currency: "INR",
      principal_minor: 1200000,
      interest_minor: 120000,
      repayment_minor: 1320000,
    },
    disbursements: [
      {
        id: 31,
        external_id: harness.external,
        date: "2026-10-17",
        amount_minor: 1200000,
        reversed: false,
        transfer: {
          id: 51,
          reversed: false,
          amount_minor: 1200000,
          date: "2026-10-17",
        },
      },
    ],
  });
  if (!("schedule" in result)) throw new Error("Expected owned snapshot");
  expect(result.schedule?.installments).toHaveLength(12);
  expect(h.calls).toEqual([{ method: "GET", path: harness.loanPath }]);
  expect("clientId" in result).toBe(false);
  expect("repaymentSchedule" in result).toBe(false);
});

test("registered and approved applications do not invent active balances or a funded schedule", async () => {
  for (const [id, expected] of [
    [100, "registered"],
    [200, "approved"],
  ] as const) {
    const h = harness.harness({
      ...harness.raw,
      status: {
        id,
        pendingApproval: id === 100,
        waitingForDisbursal: id === 200,
        active: false,
        closed: false,
      },
      timeline: {
        submittedOnDate: [2026, 10, 17],
        approvedOnDate: id === 200 ? [2026, 10, 17] : null,
        expectedDisbursementDate: [2026, 10, 17],
      },
      summary: null,
      repaymentSchedule: null,
      transactions: [],
      charges: undefined,
    });
    expect(await h.inspect()).toMatchObject({
      status: expected,
      actual_disbursement_date: null,
      principal_disbursed_minor: null,
      principal_outstanding_minor: null,
      outstanding_minor: null,
      schedule: null,
      disbursements: [],
    });
    expect((await h.denied(true)).uncertain).toBe(true);
    expect(h.calls.every((call) => call.method === "GET")).toBe(true);
  }
});

test("enquiry rejects foreign identities and mismatched terms, unsupported states or contradictory facts", async () => {
  for (const change of [
    { externalId: "another-loan" },
    { id: 99 },
    { clientId: 99 },
    { loanProductId: 99 },
    { linkedAccount: { id: 99 } },
  ])
    expect(
      (await harness.harness({ ...harness.raw, ...change }).denied()).status,
    ).toBe(403);
  for (const change of [
    { principal: 11000 },
    { proposedPrincipal: 13000 },
    { approvedPrincipal: 11000 },
    { numberOfRepayments: 24 },
    { annualInterestRate: 24 },
    { loanType: { id: 2 } },
    { status: { ...harness.raw.status, id: 600 } },
    { status: { ...harness.raw.status, active: false } },
    { summary: null },
    { transactions: null },
    { repaymentSchedule: null },
    { charges: [{ id: 9 }] },
    { summary: { ...harness.raw.summary, feeChargesCharged: 1 } },
    { currency: { code: "USD", decimalPlaces: 2 } },
    { isTopup: true },
    {
      status: {
        id: 200,
        pendingApproval: false,
        waitingForDisbursal: true,
        active: false,
        closed: false,
      },
      timeline: { expectedDisbursementDate: [2026, 10, 17] },
      summary: null,
    },
    {
      timeline: {
        ...harness.raw.timeline,
        expectedDisbursementDate: [2026, 10, 18],
      },
    },
  ])
    expect(
      (await harness.harness({ ...harness.raw, ...change }).denied()).status,
    ).toBe(503);
  const h = harness.harness();
  expect(
    (await h.denied(false, { ...harness.lookup, external_id: "../../bad" }))
      .status,
  ).toBe(400);
  expect((await h.denied(true, harness.lookup, "../../bad")).status).toBe(400);
  expect(h.calls).toHaveLength(0);
  const invalidId = harness.harness();
  expect(
    (await invalidId.denied(false, { ...harness.lookup, core_id: 0 })).status,
  ).toBe(400);
  expect(invalidId.calls).toHaveLength(0);
});

test("disbursement proof requires the exact external transaction and corroborating owned transfer", async () => {
  const h = harness.harness();
  const result = await h.proof();
  expect(result).toMatchObject({
    transaction_id: 31,
    transfer_id: 51,
    amount_minor: 1200000,
    date: "2026-10-17",
    loan: { id: 21, status: "active" },
  });
  expect(h.calls).toEqual([
    { method: "GET", path: harness.loanPath },
    { method: "GET", path: "accounttransfers/51" },
  ]);
});
