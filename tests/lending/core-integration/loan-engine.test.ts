import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../../src/platform/banking-workspace/domain/ports";
import {
  LoanEngine,
  type LoanQuoteInput,
} from "../../../src/platform/lending/domain/origination/loan-engine";
import { loanEngineLayer } from "../../../src/platform/lending/infrastructure/loan-engine";
import { inventedLoanProduct as product } from "../../fixtures/loan-product";

const input: LoanQuoteInput = {
  owner: {
    bank_id: "example-bank",
    product_id: 11,
    client_id: 12,
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
};
// Independently invented DTOs exercise translation, not real core pricing evidence.
const account = {
  id: 13,
  clientId: 12,
  currency: { code: "INR", decimalPlaces: 2 },
  status: { active: true },
};
const schedule = {
  currency: { code: "INR", decimalPlaces: 2 },
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
    ...Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 10 + index, 17));
      return {
        period: index + 1,
        dueDate: [date.getUTCFullYear(), date.getUTCMonth() + 1, 17],
        principalDue: 1000,
        interestDue: 100,
        feeChargesDue: 0,
        penaltyChargesDue: 0,
        totalDueForPeriod: 1100,
      };
    }),
  ],
};
interface Call {
  method: string;
  path: string;
  body?: unknown;
  key?: string;
}
const harness = (
  changes: Record<string, unknown> = {},
  failedPath?: string,
) => {
  const calls: Call[] = [];
  const responses: Record<string, unknown> = {
    "loanproducts/11": product,
    "savingsaccounts/13": account,
    "loans?command=calculateLoanSchedule": schedule,
    ...changes,
  };
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.gen(function* () {
        calls.push({ method, path, body, key });
        if (failedPath === path)
          return yield* Effect.fail(
            new BankingError({
              message: "Injected core failure",
              status: 503,
              uncertain: method !== "GET",
            }),
          );
        if (!(path in responses))
          return yield* Effect.fail(
            new BankingError({ message: "Unexpected core route", status: 500 }),
          );
        return structuredClone(responses[path]) as T;
      }),
  });
  const task = (request = input) =>
    Effect.gen(function* () {
      return yield* (yield* LoanEngine).quote(request);
    }).pipe(Effect.provide(loanEngineLayer), Effect.provide(core));
  return {
    calls,
    run: (request = input) => Effect.runPromise(task(request)),
    denied: (request = input) =>
      Effect.runPromise(task(request).pipe(Effect.flip)),
  };
};

test("loan quotes verify product/account then use only the core schedule calculator and return normalized paise", async () => {
  const h = harness();
  const result = await h.run();
  expect(result).toEqual({
    currency: "INR",
    principal_minor: 1200000,
    interest_minor: 120000,
    repayment_minor: 1320000,
    installments: schedule.periods.slice(1).map((row) => ({
      period: row.period,
      due_date: row.dueDate
        .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
        .join("-"),
      principal_minor: 100000,
      interest_minor: 10000,
      total_minor: 110000,
    })),
  });
  expect(
    h.calls
      .filter((call) => call.method === "GET")
      .map((call) => call.path)
      .sort(),
  ).toEqual(["loanproducts/11", "savingsaccounts/13"]);
  expect(h.calls.filter((call) => call.method !== "GET")).toEqual([
    {
      method: "POST",
      path: "loans?command=calculateLoanSchedule",
      key: undefined,
      body: {
        locale: "en",
        dateFormat: "yyyy-MM-dd",
        loanType: "individual",
        submittedOnDate: "2026-10-17",
        productId: 11,
        clientId: 12,
        principal: 12000,
        loanTermFrequency: 12,
        loanTermFrequencyType: 2,
        numberOfRepayments: 12,
        repaymentEvery: 1,
        repaymentFrequencyType: 2,
        interestRatePerPeriod: 1,
        interestType: 0,
        amortizationType: 1,
        interestCalculationPeriodType: 1,
        expectedDisbursementDate: "2026-10-17",
        transactionProcessingStrategyCode: "mifos-standard-strategy",
      },
    },
  ]);
  expect(h.calls.at(-1)?.path).toBe("loans?command=calculateLoanSchedule");
});

test("invalid owned inputs or calendar dates never reach the core", async () => {
  for (const request of [
    { ...input, owner: { ...input.owner, product_id: 0 } },
    { ...input, owner: { ...input.owner, savings_account_id: -1 } },
    { ...input, terms: { ...input.terms, principal: 10500 } },
    { ...input, expected_disbursement_date: "2026-02-30" },
  ]) {
    const h = harness();
    expect((await h.denied(request)).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  }
});

test("foreign accounts/products and incompatible product or currency configurations cannot calculate a quote", async () => {
  for (const [path, response, status] of [
    ["loanproducts/11", { ...product, id: 99 }, 403],
    ["savingsaccounts/13", { ...account, clientId: 99 }, 403],
    ["savingsaccounts/13", { ...account, id: 99 }, 403],
    ["savingsaccounts/13", { ...account, status: { active: false } }, 503],
    [
      "savingsaccounts/13",
      { ...account, currency: { code: "USD", decimalPlaces: 2 } },
      503,
    ],
    ["loanproducts/11", { ...product, shortName: "OTHER" }, 503],
    ["loanproducts/11", { ...product, interestRatePerPeriod: 2 }, 503],
    [
      "loanproducts/11",
      { ...product, interestRateFrequencyType: { id: 3 } },
      503,
    ],
    ["loanproducts/11", { ...product, multiDisburseLoan: true }, 503],
    ["loanproducts/11", { ...product, accountingRule: { id: 1 } }, 503],
    ["loanproducts/11", { ...product, charges: [{ id: 9 }] }, 503],
    [
      "loanproducts/11",
      { ...product, loanScheduleType: { code: "PROGRESSIVE" } },
      503,
    ],
    ["loanproducts/11", { ...product, loanScheduleType: "CUMULATIVE" }, 503],
    [
      "loanproducts/11",
      { ...product, loanScheduleProcessingType: { code: "VERTICAL" } },
      503,
    ],
    ["loanproducts/11", { ...product, enableDownPayment: true }, 503],
    [
      "loanproducts/11",
      { ...product, enableAutoRepaymentForDownPayment: true },
      503,
    ],
    ["loanproducts/11", { ...product, isRatesEnabled: true }, 503],
    ["loanproducts/11", { ...product, enableIncomeCapitalization: true }, 503],
    [
      "loanproducts/11",
      { ...product, isLinkedToFloatingInterestRates: true },
      503,
    ],
  ] as const) {
    const h = harness({ [path]: response });
    expect((await h.denied()).status).toBe(status);
    expect(h.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
  }
});

test("malformed schedules, hidden charges, repeat disbursements and fractional paise fail closed", async () => {
  const rows = schedule.periods;
  for (const response of [
    null,
    { ...schedule, currency: { code: "INR", decimalPlaces: 3 } },
    { ...schedule, totalPrincipalExpected: 13000 },
    { ...schedule, totalPrincipalDisbursed: 13000 },
    { ...schedule, totalFeeChargesCharged: 1 },
    { ...schedule, totalPenaltyChargesCharged: 1 },
    { ...schedule, totalInterestCharged: 1200.001 },
    { ...schedule, totalRepaymentExpected: 13200.01 },
    { ...schedule, periods: rows.slice(1) },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 1 ? { ...row, period: undefined } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) => (i === 1 ? { ...row, period: null } : row)),
    },
    { ...schedule, periods: [rows[0], ...rows] },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 0 ? { ...row, dueDate: [2026, 10, 18] } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 0 ? { ...row, principalDue: 1 } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 1 ? { ...row, principalDisbursed: 1 } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 1 ? { ...row, feeChargesDue: 1 } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 1 ? { ...row, penaltyChargesDue: 1 } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 1 ? { ...row, interestDue: undefined } : row,
      ),
    },
    {
      ...schedule,
      periods: rows.map((row, i) =>
        i === 1 ? { ...row, dueDate: [2026, 11, 31] } : row,
      ),
    },
  ]) {
    const h = harness({ "loans?command=calculateLoanSchedule": response });
    expect((await h.denied()).status).toBe(503);
    expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  }
});

test("decimal floating representation is accepted only when exact paise and component totals reconcile", async () => {
  const result = await harness({
    "loans?command=calculateLoanSchedule": {
      ...schedule,
      totalInterestCharged: 1200.01,
      totalRepaymentExpected: 13200.01,
      periods: schedule.periods.map((row, i) =>
        i === 1
          ? {
              ...row,
              interestDue: 100.01000000000002,
              totalDueForPeriod: 1100.01,
            }
          : row,
      ),
    },
  }).run();
  expect(result.interest_minor).toBe(120001);
  expect(result.repayment_minor).toBe(1320001);
  expect(result.installments[0]).toEqual({
    period: 1,
    due_date: "2026-11-17",
    principal_minor: 100000,
    interest_minor: 10001,
    total_minor: 110001,
  });
});

test("core failures never synthesize a quote or retry a calculator request", async () => {
  for (const path of [
    "loanproducts/11",
    "savingsaccounts/13",
    "loans?command=calculateLoanSchedule",
  ]) {
    const h = harness({}, path);
    const error = await h.denied();
    expect(error.message).toBe("Injected core failure");
    expect(error.status).toBe(503);
    expect(h.calls.filter((call) => call.path === path)).toHaveLength(1);
    expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(
      path.startsWith("loans?") ? 1 : 0,
    );
  }
});

test("pinned Core disbursement headers omit a repayment number and carry nullable unused zero components", async () => {
  for (const period of [undefined, null]) {
    const h = harness({
      "loans?command=calculateLoanSchedule": {
        ...schedule,
        periods: [
          {
            ...schedule.periods[0],
            period,
            principalDue: null,
            interestDue: null,
            penaltyChargesDue: null,
          },
          ...schedule.periods
            .slice(1)
            .map((row) => ({ ...row, principalDisbursed: null })),
        ],
      },
    });
    const result = await h.run();
    expect(result).toMatchObject({
      currency: "INR",
      principal_minor: 1200000,
      interest_minor: 120000,
      repayment_minor: 1320000,
    });
    expect(result.installments).toHaveLength(12);
    expect(result.installments[0].period).toBe(1);
    expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  }
});
