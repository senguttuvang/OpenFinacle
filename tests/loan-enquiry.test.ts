import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { loanEnquiryLayer } from "../src/adapters/loan-enquiry";
import { BankingError } from "../src/domain/banking";
import { LoanEnquiry, type LoanLookup } from "../src/domain/loan-engine";
import { loanStatementCsv } from "../src/domain/loan-statements";
import { Core } from "../src/domain/ports";

const lookup: LoanLookup = {
  owner: {
    bank_id: "example-bank",
    client_id: 12,
    product_id: 11,
    savings_account_id: 13,
  },
  terms: {
    product: "core-personal",
    principal: 12000,
    months: 12,
    purpose: "education",
    monthly_income: 30000,
    monthly_commitments: 5000,
    monthly_expenses: 10000,
  },
  expected_disbursement_date: "2026-10-17",
  external_id: "of-loan-example",
  core_id: 21,
};
const external = "of-disburse-example";
const currency = { code: "INR", decimalPlaces: 2 };
const basicTransfer = {
  id: 51,
  reversed: false,
  currency,
  transferAmount: 12000,
  transferDate: [2026, 10, 17],
};
const transaction = {
  id: 31,
  type: { id: 1 },
  currency,
  date: [2026, 10, 17],
  amount: 12000,
  manuallyReversed: false,
  externalId: external,
  transfer: basicTransfer,
};
// Invented examples exercise response correlation, not running-engine/accounting proof.
const raw = {
  id: 21,
  externalId: lookup.external_id,
  clientId: 12,
  loanProductId: 11,
  loanType: { id: 1 },
  linkedAccount: { id: 13 },
  currency,
  principal: 12000,
  proposedPrincipal: 12000,
  approvedPrincipal: 12000,
  termFrequency: 12,
  termPeriodFrequencyType: { id: 2 },
  numberOfRepayments: 12,
  repaymentEvery: 1,
  repaymentFrequencyType: { id: 2 },
  interestRatePerPeriod: 1,
  interestRateFrequencyType: { id: 2 },
  annualInterestRate: 12,
  amortizationType: { id: 1 },
  interestType: { id: 0 },
  interestCalculationPeriodType: { id: 1 },
  transactionProcessingStrategyCode: "mifos-standard-strategy",
  multiDisburseLoan: false,
  isTopup: false,
  isInterestRecalculationEnabled: false,
  isFloatingInterestRate: false,
  status: {
    id: 300,
    pendingApproval: false,
    waitingForDisbursal: false,
    active: true,
    closed: false,
  },
  timeline: {
    submittedOnDate: [2026, 10, 17],
    approvedOnDate: [2026, 10, 17],
    expectedDisbursementDate: [2026, 10, 17],
    actualDisbursementDate: [2026, 10, 17],
  },
  summary: {
    principalDisbursed: 12000,
    principalOutstanding: 12000,
    totalOutstanding: 13200,
    feeChargesCharged: 0,
    penaltyChargesCharged: 0,
  },
  repaymentSchedule: {
    currency,
    totalPrincipalDisbursed: 12000,
    totalPrincipalExpected: 12000,
    totalInterestCharged: 1200,
    totalFeeChargesCharged: 0,
    totalPenaltyChargesCharged: 0,
    totalRepaymentExpected: 13200,
    periods: [
      {
        period: 0,
        dueDate: [2026, 10, 17],
        principalDisbursed: 12000,
        feeChargesDue: 0,
        totalDueForPeriod: 0,
      },
      ...Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(2026, 10 + i, 17));
        return {
          period: i + 1,
          dueDate: [d.getUTCFullYear(), d.getUTCMonth() + 1, 17],
          principalDue: 1000,
          interestDue: 100,
          feeChargesDue: 0,
          penaltyChargesDue: 0,
          totalDueForPeriod: 1100,
        };
      }),
    ],
  },
  transactions: [transaction],
  charges: null,
};
const transfer = {
  ...basicTransfer,
  // Direct AccountTransferData uses Jackson ISO_LOCAL_DATE; embedded legacy loan data uses arrays.
  transferDate: "2026-10-17",
  fromClient: { id: 12 },
  toClient: { id: 12 },
  fromAccountType: { id: 1 },
  toAccountType: { id: 2 },
  fromAccount: { id: 21 },
  toAccount: { id: 13 },
};

test("full transfer uses a strict ISO calendar date while embedded transfer retains the legacy date array", async () => {
  const h = harness();
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
    const rejected = harness(raw, { ...transfer, transferDate });
    const error = await rejected.denied(true);
    expect(error.uncertain).toBe(true);
    expect(rejected.calls.every((call) => call.method === "GET")).toBe(true);
  }
});
const loanPath =
  "loans/external-id/of-loan-example?associations=repaymentSchedule,transactions,charges,linkedAccount";
const harness = (
  loan: unknown = raw,
  fullTransfer: unknown = transfer,
  failedPath?: string,
  failedStatus = 422,
) => {
  const calls: { method: string; path: string }[] = [];
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string) =>
      Effect.gen(function* () {
        calls.push({ method, path });
        if (
          method !== "GET" ||
          (path !== loanPath && path !== "accounttransfers/51")
        )
          return yield* Effect.fail(
            new BankingError({
              message: "Unexpected route or write",
              status: 500,
            }),
          );
        if (path === failedPath)
          return yield* Effect.fail(
            new BankingError({
              message: "Core object unavailable",
              status: failedStatus,
            }),
          );
        return structuredClone(path === loanPath ? loan : fullTransfer) as T;
      }),
  });
  const task = (proof: boolean, input = lookup, transactionId = external) =>
    Effect.gen(function* () {
      const enquiry = yield* LoanEnquiry;
      return proof
        ? yield* enquiry.confirmDisbursement({
            ...input,
            transaction_external_id: transactionId,
          })
        : yield* enquiry.inspect(input);
    }).pipe(Effect.provide(loanEnquiryLayer), Effect.provide(core));
  return {
    calls,
    statement: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* LoanEnquiry).statement(lookup);
        }).pipe(Effect.provide(loanEnquiryLayer), Effect.provide(core)),
      ),
    statementDenied: () =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* LoanEnquiry).statement(lookup);
        }).pipe(
          Effect.provide(loanEnquiryLayer),
          Effect.provide(core),
          Effect.flip,
        ),
      ),
    inspect: (input = lookup) => Effect.runPromise(task(false, input)),
    proof: () => Effect.runPromise(task(true)),
    denied: (proof = false, input = lookup, transactionId = external) =>
      Effect.runPromise(task(proof, input, transactionId).pipe(Effect.flip)),
  };
};

const statementRaw = {
  ...raw,
  summary: {
    ...raw.summary,
    currency,
    principalPaid: 0,
    interestPaid: 0,
    totalRepayment: 0,
    interestOutstanding: 1200,
    feeChargesPaid: 0,
    penaltyChargesPaid: 0,
    feeChargesOutstanding: 0,
    penaltyChargesOutstanding: 0,
  },
  transactions: [
    {
      ...transaction,
      loanId: 21,
      externalLoanId: lookup.external_id,
      principalPortion: 0,
      interestPortion: 0,
      feeChargesPortion: 0,
      penaltyChargesPortion: 0,
      overpaymentPortion: 0,
      unrecognizedIncomePortion: 0,
      reversedOnDate: null,
    },
  ],
};
test("an explicit statement uses one owned read, preserves manual reversals and other Core types, and exports only normalized source facts", async () => {
  const disbursement = statementRaw.transactions[0];
  const h = harness({
    ...statementRaw,
    transactions: [
      disbursement,
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
      },
      {
        ...disbursement,
        id: 33,
        type: { id: 77 },
        date: [2026, 10, 19],
        amount: 0,
      },
    ],
  });
  const result = await h.statement();
  expect(h.calls).toEqual([{ method: "GET", path: loanPath }]);
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
  expect(csv).not.toContain(lookup.external_id);
  expect(csv).not.toContain(external);
  expect(csv).toEndWith("\r\n");
});
test("statement ownership, completeness, exact components, dates and Core summary fail closed without affecting ordinary original proof", async () => {
  const row = statementRaw.transactions[0];
  const invalid = [
    raw,
    { ...statementRaw, transactions: [{ ...row, type: { id: 2 }, amount: 0 }] },
    { ...statementRaw, transactions: [] },
    { ...statementRaw, transactions: [row, row] },
    { ...statementRaw, transactions: [{ ...row, loanId: 99 }] },
    {
      ...statementRaw,
      transactions: [{ ...row, externalLoanId: "foreign-loan" }],
    },
    {
      ...statementRaw,
      transactions: [{ ...row, currency: { code: "USD", decimalPlaces: 2 } }],
    },
    {
      ...statementRaw,
      transactions: [{ ...row, principalPortion: undefined }],
    },
    { ...statementRaw, transactions: [{ ...row, interestPortion: 0.001 }] },
    { ...statementRaw, transactions: [{ ...row, feeChargesPortion: -1 }] },
    { ...statementRaw, transactions: [{ ...row, type: { id: 3 } }] },
    { ...statementRaw, transactions: [{ ...row, date: [2026, 2, 30] }] },
    { ...statementRaw, transactions: [{ ...row, date: [2026, 10, 16] }] },
    {
      ...statementRaw,
      transactions: [{ ...row, reversedOnDate: [2026, 10, 18] }],
    },
    {
      ...statementRaw,
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
      ...statementRaw,
      summary: { ...statementRaw.summary, totalRepayment: 1 },
    },
    {
      ...statementRaw,
      summary: { ...statementRaw.summary, interestOutstanding: 1199 },
    },
    {
      ...statementRaw,
      summary: { ...statementRaw.summary, feeChargesPaid: 1 },
    },
    {
      ...statementRaw,
      transactions: Array.from({ length: 1001 }, (_, i) => ({
        ...row,
        id: i + 1,
      })),
    },
  ];
  for (const response of invalid) {
    const h = harness(response);
    expect((await h.statementDenied()).status).toBe(503);
    expect(h.calls).toEqual([{ method: "GET", path: loanPath }]);
  }
  expect(await harness(raw).proof()).toMatchObject({ transaction_id: 31 });
});

test("read-only proof diagnostics select static schema checks and discard response values and transport messages", async () => {
  const marker = "invented-private-response-marker";
  const h = harness({
    ...raw,
    transactions: [
      {
        ...transaction,
        manuallyReversed: marker,
        transfer: { ...basicTransfer, currency: marker },
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
  const absent = harness(raw, transfer, loanPath);
  expect((await absent.denied(true)).loanProofChecks).toEqual(["core-read"]);
  const foreign = harness({ ...raw, clientId: 999 });
  expect((await foreign.denied(true)).loanProofChecks).toEqual([
    "loan-ownership",
  ]);
});

test("owned loan enquiry normalizes core facts and schedules without quote expiry or any write", async () => {
  const h = harness();
  const result = await h.inspect();
  expect(result).toMatchObject({
    id: 21,
    external_id: lookup.external_id,
    owner: lookup.owner,
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
        external_id: external,
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
  expect(h.calls).toEqual([{ method: "GET", path: loanPath }]);
  expect("clientId" in result).toBe(false);
  expect("repaymentSchedule" in result).toBe(false);
});

test("registered and approved applications do not invent active balances or a funded schedule", async () => {
  for (const [id, expected] of [
    [100, "registered"],
    [200, "approved"],
  ] as const) {
    const h = harness({
      ...raw,
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
    expect((await harness({ ...raw, ...change }).denied()).status).toBe(403);
  for (const change of [
    { principal: 11000 },
    { proposedPrincipal: 13000 },
    { approvedPrincipal: 11000 },
    { numberOfRepayments: 24 },
    { annualInterestRate: 24 },
    { loanType: { id: 2 } },
    { status: { ...raw.status, id: 600 } },
    { status: { ...raw.status, active: false } },
    { summary: null },
    { transactions: null },
    { repaymentSchedule: null },
    { charges: [{ id: 9 }] },
    { summary: { ...raw.summary, feeChargesCharged: 1 } },
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
    { timeline: { ...raw.timeline, expectedDisbursementDate: [2026, 10, 18] } },
  ])
    expect((await harness({ ...raw, ...change }).denied()).status).toBe(503);
  const h = harness();
  expect(
    (await h.denied(false, { ...lookup, external_id: "../../bad" })).status,
  ).toBe(400);
  expect((await h.denied(true, lookup, "../../bad")).status).toBe(400);
  expect(h.calls).toHaveLength(0);
  const invalidId = harness();
  expect(
    (await invalidId.denied(false, { ...lookup, core_id: 0 })).status,
  ).toBe(400);
  expect(invalidId.calls).toHaveLength(0);
});

test("disbursement proof requires the exact external transaction and corroborating owned transfer", async () => {
  const h = harness();
  const result = await h.proof();
  expect(result).toMatchObject({
    transaction_id: 31,
    transfer_id: 51,
    amount_minor: 1200000,
    date: "2026-10-17",
    loan: { id: 21, status: "active" },
  });
  expect(h.calls).toEqual([
    { method: "GET", path: loanPath },
    { method: "GET", path: "accounttransfers/51" },
  ]);
});

test("withdrawn identity requires its original submission and actual withdrawal timeline without funding facts", async () => {
  const withdrawn = {
    ...raw,
    approvedPrincipal: null,
    status: {
      id: 400,
      pendingApproval: false,
      waitingForDisbursal: false,
      active: false,
      closed: false,
    },
    timeline: {
      submittedOnDate: [2026, 10, 17],
      expectedDisbursementDate: [2026, 10, 17],
      withdrawnOnDate: [2026, 10, 18],
    },
    summary: null,
    repaymentSchedule: null,
    transactions: [],
  };
  const h = harness(withdrawn);
  expect(await h.inspect()).toMatchObject({
    status: "withdrawn",
    submitted_on_date: "2026-10-17",
    approved_on_date: null,
    withdrawn_on_date: "2026-10-18",
    actual_disbursement_date: null,
    schedule: null,
  });
  expect((await h.denied(true)).uncertain).toBe(true);
  expect(h.calls.every((c) => c.method === "GET")).toBe(true);
  for (const changed of [
    { timeline: { ...withdrawn.timeline, withdrawnOnDate: null } },
    { timeline: { ...withdrawn.timeline, withdrawnOnDate: [2026, 10, 16] } },
    { timeline: { ...withdrawn.timeline, approvedOnDate: [2026, 10, 17] } },
    { timeline: { ...withdrawn.timeline, submittedOnDate: [2026, 10, 16] } },
    { summary: raw.summary },
    { transactions: [transaction] },
    { status: { ...withdrawn.status, closed: true } },
  ])
    expect((await harness({ ...withdrawn, ...changed }).denied()).status).toBe(
      503,
    );
});

test("active status, cash disbursement, duplicate or reversed history and mismatched amounts never prove savings posting", async () => {
  for (const transactions of [
    [],
    [transaction, transaction],
    [{ ...transaction, externalId: "other-command" }],
    [{ ...transaction, transfer: null }],
    [{ ...transaction, manuallyReversed: true }],
    [{ ...transaction, transfer: { ...basicTransfer, reversed: true } }],
    [{ ...transaction, amount: 11000 }],
    [{ ...transaction, transfer: { ...basicTransfer, transferAmount: 11000 } }],
    [{ ...transaction, date: [2026, 10, 18] }],
    [
      {
        ...transaction,
        transfer: { ...basicTransfer, transferDate: [2026, 10, 18] },
      },
    ],
  ]) {
    const h = harness({ ...raw, transactions });
    const error = await h.denied(true);
    expect(error.status).toBe(409);
    expect(error.uncertain).toBe(true);
    expect(h.calls).toEqual([{ method: "GET", path: loanPath }]);
  }
  for (const changed of [
    { ...raw, summary: { ...raw.summary, principalDisbursed: 11000 } },
    {
      ...raw,
      timeline: { ...raw.timeline, actualDisbursementDate: [2026, 10, 18] },
      repaymentSchedule: {
        ...raw.repaymentSchedule,
        periods: raw.repaymentSchedule.periods.map((row, index) =>
          index === 0 ? { ...row, dueDate: [2026, 10, 18] } : row,
        ),
      },
    },
  ])
    expect(await harness(changed).denied(true)).toMatchObject({
      status: 409,
      uncertain: true,
    });
});

test("unreversed transfer must match loan, savings destination, both clients, types, amount, currency and date", async () => {
  for (const change of [
    { id: 52 },
    { reversed: true },
    { fromAccount: { id: 99 } },
    { toAccount: { id: 99 } },
    { fromClient: { id: 99 } },
    { toClient: { id: 99 } },
    { transferAmount: 11999 },
    { transferDate: "2026-10-18" },
  ]) {
    const h = harness(raw, { ...transfer, ...change });
    expect(await h.denied(true)).toMatchObject({
      status: 409,
      uncertain: true,
    });
    expect(h.calls).toHaveLength(2);
  }
  for (const change of [
    { fromAccountType: { id: 2 } },
    { toAccountType: { id: 1 } },
    { currency: { code: "USD", decimalPlaces: 2 } },
  ])
    expect(
      await harness(raw, { ...transfer, ...change }).denied(true),
    ).toMatchObject({ status: 503, uncertain: true });
});

test("missing loan or transfer reads remain unconfirmed without null success, retry or POST", async () => {
  const absent = harness(raw, transfer, loanPath);
  expect((await absent.denied()).status).toBe(422);
  expect(absent.calls).toHaveLength(1);
  for (const failed of [loanPath, "accounttransfers/51"]) {
    for (const code of [422, 503]) {
      const h = harness(raw, transfer, failed, code);
      expect(await h.denied(true)).toMatchObject({
        status: code === 503 ? 503 : 409,
        uncertain: true,
      });
      expect(h.calls.filter((call) => call.path === failed)).toHaveLength(1);
      expect(h.calls.every((call) => call.method === "GET")).toBe(true);
    }
  }
});
