import { expect, test } from "bun:test";
import { createHarness } from "./loan-enquiry.harness";

const harness = createHarness();
test("withdrawn identity requires its original submission and actual withdrawal timeline without funding facts", async () => {
  const withdrawn = {
    ...harness.raw,
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
  const h = harness.harness(withdrawn);
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
    { summary: harness.raw.summary },
    { transactions: [harness.transaction] },
    { status: { ...withdrawn.status, closed: true } },
  ])
    expect(
      (await harness.harness({ ...withdrawn, ...changed }).denied()).status,
    ).toBe(503);
});

test("active status, cash disbursement, duplicate or reversed history and mismatched amounts never prove savings posting", async () => {
  for (const transactions of [
    [],
    [harness.transaction, harness.transaction],
    [{ ...harness.transaction, externalId: "other-command" }],
    [{ ...harness.transaction, transfer: null }],
    [{ ...harness.transaction, manuallyReversed: true }],
    [
      {
        ...harness.transaction,
        transfer: { ...harness.basicTransfer, reversed: true },
      },
    ],
    [{ ...harness.transaction, amount: 11000 }],
    [
      {
        ...harness.transaction,
        transfer: { ...harness.basicTransfer, transferAmount: 11000 },
      },
    ],
    [{ ...harness.transaction, date: [2026, 10, 18] }],
    [
      {
        ...harness.transaction,
        transfer: { ...harness.basicTransfer, transferDate: [2026, 10, 18] },
      },
    ],
  ]) {
    const h = harness.harness({ ...harness.raw, transactions });
    const error = await h.denied(true);
    expect(error.status).toBe(409);
    expect(error.uncertain).toBe(true);
    expect(h.calls).toEqual([{ method: "GET", path: harness.loanPath }]);
  }
  for (const changed of [
    {
      ...harness.raw,
      summary: { ...harness.raw.summary, principalDisbursed: 11000 },
    },
    {
      ...harness.raw,
      timeline: {
        ...harness.raw.timeline,
        actualDisbursementDate: [2026, 10, 18],
      },
      repaymentSchedule: {
        ...harness.raw.repaymentSchedule,
        periods: harness.raw.repaymentSchedule.periods.map((row, index) =>
          index === 0 ? { ...row, dueDate: [2026, 10, 18] } : row,
        ),
      },
    },
  ])
    expect(await harness.harness(changed).denied(true)).toMatchObject({
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
    const h = harness.harness(harness.raw, { ...harness.transfer, ...change });
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
      await harness
        .harness(harness.raw, { ...harness.transfer, ...change })
        .denied(true),
    ).toMatchObject({ status: 503, uncertain: true });
});

test("missing loan or transfer reads remain unconfirmed without null success, retry or POST", async () => {
  const absent = harness.harness(
    harness.raw,
    harness.transfer,
    harness.loanPath,
  );
  expect((await absent.denied()).status).toBe(422);
  expect(absent.calls).toHaveLength(1);
  for (const failed of [harness.loanPath, "accounttransfers/51"]) {
    for (const code of [422, 503]) {
      const h = harness.harness(harness.raw, harness.transfer, failed, code);
      expect(await h.denied(true)).toMatchObject({
        status: code === 503 ? 503 : 409,
        uncertain: true,
      });
      expect(h.calls.filter((call) => call.path === failed)).toHaveLength(1);
      expect(h.calls.every((call) => call.method === "GET")).toBe(true);
    }
  }
});
