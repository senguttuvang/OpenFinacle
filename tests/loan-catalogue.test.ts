import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { loanCatalogueLayer } from "../src/adapters/loan-catalogue";
import { BankingError } from "../src/domain/banking";
import {
  LoanCatalogue,
  type LoanSetupStep,
  loanLedgerDefinitions,
} from "../src/domain/loan-product";
import { Core } from "../src/domain/ports";

// Invented reference DTOs verify the boundary, not compatibility with a running core.
const account = (id: number, glCode: string, name: string, type: number) => ({
  id,
  glCode,
  name,
  type: { id: type },
  usage: { id: 1 },
  disabled: false,
  manualEntriesAllowed: true,
});
const base = [
  account(1, "OF1001", "Cash and settlement", 1),
  account(2, "OF2002", "Transfer clearing", 2),
];
const kinds = { asset: 1, liability: 2, income: 4, expense: 5 } as const;
const references = loanLedgerDefinitions.map((item, index) =>
  account(index + 3, item.code, item.name, kinds[item.kind]),
);
const mappings = {
  fundSourceAccount: { id: 1 },
  loanPortfolioAccount: { id: 3 },
  transfersInSuspenseAccount: { id: 4 },
  overpaymentLiabilityAccount: { id: 5 },
  interestOnLoanAccount: { id: 6 },
  incomeFromFeeAccount: { id: 6 },
  incomeFromPenaltyAccount: { id: 6 },
  incomeFromRecoveryAccount: { id: 6 },
  writeOffAccount: { id: 7 },
  goodwillCreditAccount: { id: 7 },
  chargeOffExpenseAccount: { id: 7 },
  chargeOffFraudExpenseAccount: { id: 7 },
  incomeFromChargeOffInterestAccount: { id: 6 },
  incomeFromChargeOffFeesAccount: { id: 6 },
  incomeFromChargeOffPenaltyAccount: { id: 6 },
  incomeFromGoodwillCreditInterestAccount: { id: 6 },
  incomeFromGoodwillCreditFeesAccount: { id: 6 },
  incomeFromGoodwillCreditPenaltyAccount: { id: 6 },
};
const product = {
  id: 8,
  shortName: "OFPL",
  name: "OpenFinacle Personal Loan",
  externalId: "openfinacle-personal-v1",
  currency: { code: "INR", decimalPlaces: 2 },
  minPrincipal: 10000,
  maxPrincipal: 500000,
  minNumberOfRepayments: 12,
  maxNumberOfRepayments: 36,
  repaymentEvery: 1,
  repaymentFrequencyType: { id: 2 },
  interestRatePerPeriod: 1,
  interestRateFrequencyType: { id: 2 },
  amortizationType: { id: 1 },
  interestType: { id: 0 },
  interestCalculationPeriodType: { id: 1 },
  transactionProcessingStrategyCode: "mifos-standard-strategy",
  accountingRule: { id: 2 },
  multiDisburseLoan: false,
  isInterestRecalculationEnabled: false,
  canDefineInstallmentAmount: false,
  allowVariableInstallments: false,
  isLinkedToFloatingInterestRates: false,
  isFloatingInterestRateCalculationAllowed: false,
  canUseForTopup: false,
  enableDownPayment: false,
  enableAutoRepaymentForDownPayment: false,
  isEqualAmortization: false,
  isRatesEnabled: false,
  interestRecognitionOnDisbursementDate: false,
  loanScheduleType: { code: "CUMULATIVE" },
  loanScheduleProcessingType: { code: "HORIZONTAL" },
  charges: [],
  accountingMappings: mappings,
};
interface Call {
  method: string;
  path: string;
  body?: unknown;
  key?: string;
}
const harness = (
  changes: Record<string, unknown> = {},
  failure?: {
    method: string;
    path: string;
    uncertain: boolean;
    status: number;
  },
) => {
  const calls: Call[] = [];
  const responses: Record<string, unknown> = {
    glaccounts: base,
    financialactivityaccounts: [
      { financialActivityData: { id: 200 }, glAccountData: { id: 2 } },
    ],
    loanproducts: [],
    "POST glaccounts": { resourceId: 3 },
    "glaccounts/3": references[0],
    "POST loanproducts": { resourceId: 8 },
    "loanproducts/8": product,
    ...changes,
  };
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.gen(function* () {
        calls.push({ method, path, body, key });
        if (failure?.method === method && failure.path === path)
          return yield* Effect.fail(
            new BankingError({
              message: "Injected core failure",
              status: failure.status,
              uncertain: failure.uncertain,
            }),
          );
        const route = method === "POST" ? `POST ${path}` : path;
        if (!(route in responses))
          return yield* Effect.fail(
            new BankingError({ message: "Unexpected route", status: 500 }),
          );
        return structuredClone(responses[route]) as T;
      }),
  });
  const task = (step?: LoanSetupStep, key = "stable-test-key") =>
    Effect.gen(function* () {
      const catalogue = yield* LoanCatalogue;
      return step
        ? yield* catalogue.execute(step, key)
        : yield* catalogue.inventory();
    }).pipe(Effect.provide(loanCatalogueLayer), Effect.provide(core));
  return {
    calls,
    run: (step?: LoanSetupStep, key?: string) =>
      Effect.runPromise(task(step, key)),
    denied: (step?: LoanSetupStep, key?: string) =>
      Effect.runPromise(task(step, key).pipe(Effect.flip)),
  };
};
const writes = (calls: Call[]) => calls.filter((call) => call.method !== "GET");

test("catalogue reads identify absent loan references without provisioning or changing savings clearing", async () => {
  const h = harness();
  expect(await h.run()).toEqual({
    cash_id: 1,
    clearing_id: 2,
    accounts: {
      OF1002: null,
      OF1003: null,
      OF2003: null,
      OF4002: null,
      OF5002: null,
    },
    product_id: null,
  });
  expect(h.calls.map((call) => call.path).sort()).toEqual([
    "financialactivityaccounts",
    "glaccounts",
    "loanproducts",
  ]);
  expect(writes(h.calls)).toEqual([]);
});

test("missing, duplicated, disabled or conflicting base/loan references and savings mappings fail before any create", async () => {
  for (const changes of [
    { glaccounts: [] },
    { glaccounts: [base[0], base[0], base[1]] },
    ...[
      { name: "Unexpected" },
      { type: { id: 2 } },
      { disabled: true },
      { manualEntriesAllowed: false },
      { usage: { id: 2 } },
    ].map((change) => ({ glaccounts: [{ ...base[0], ...change }, base[1]] })),
    { glaccounts: [...base, references[0], references[0]] },
    { glaccounts: [...base, { ...references[0], type: { id: 4 } }] },
    { financialactivityaccounts: [] },
    {
      financialactivityaccounts: [
        { financialActivityData: { id: 200 }, glAccountData: { id: 1 } },
      ],
    },
    {
      financialactivityaccounts: Array.from({ length: 2 }, () => ({
        financialActivityData: { id: 200 },
        glAccountData: { id: 2 },
      })),
    },
    { glaccounts: {} },
    { loanproducts: {} },
  ]) {
    const h = harness(changes);
    expect((await h.denied({ kind: "account", code: "OF1002" })).status).toBe(
      503,
    );
    expect(writes(h.calls)).toEqual([]);
  }
});

test("an existing product is accepted only with its complete exact identity, terms and accounting mappings", async () => {
  const setup = {
    glaccounts: [...base, ...references],
    loanproducts: [product],
  };
  const h = harness(setup);
  expect(await h.run()).toEqual({
    cash_id: 1,
    clearing_id: 2,
    accounts: { OF1002: 3, OF1003: 4, OF2003: 5, OF4002: 6, OF5002: 7 },
    product_id: 8,
  });
  for (const step of [
    { kind: "product" },
    ...loanLedgerDefinitions.map(({ code }) => ({ kind: "account", code })),
  ] as LoanSetupStep[])
    await h.run(step);
  expect(writes(h.calls)).toEqual([]);
  for (const changes of [
    { loanproducts: [product, product] },
    { "loanproducts/8": { ...product, id: 9 } },
    { "loanproducts/8": { ...product, shortName: "WRONG" } },
    { "loanproducts/8": { ...product, externalId: "foreign" } },
    { "loanproducts/8": { ...product, interestRatePerPeriod: 2 } },
    {
      "loanproducts/8": {
        ...product,
        accountingMappings: { ...mappings, loanPortfolioAccount: { id: 1 } },
      },
    },
    { glaccounts: base },
  ]) {
    const bad = harness({ ...setup, ...changes });
    expect(
      (await bad.denied({ kind: "product" })).status,
    ).toBeGreaterThanOrEqual(400);
    expect(writes(bad.calls)).toEqual([]);
  }
});

test("each account creation uses one stable keyed POST followed by exact identity read-back", async () => {
  for (const [index, definition] of loanLedgerDefinitions.entries()) {
    const target = references[index];
    const h = harness({
      "POST glaccounts": { resourceId: target.id },
      [`glaccounts/${target.id}`]: target,
    });
    expect(await h.run({ kind: "account", code: definition.code })).toBe(
      target.id,
    );
    expect(writes(h.calls)).toEqual([
      {
        method: "POST",
        path: "glaccounts",
        key: "stable-test-key",
        body: {
          glCode: definition.code,
          name: definition.name,
          type: kinds[definition.kind],
          usage: 1,
          manualEntriesAllowed: true,
        },
      },
    ]);
    expect(h.calls.at(-1)?.path).toBe(`glaccounts/${target.id}`);
  }
});

test("product creation requires all verified accounts and sends all eighteen accounting mappings with the fixed pricing contract", async () => {
  const missing = harness();
  expect((await missing.denied({ kind: "product" })).status).toBe(409);
  expect(writes(missing.calls)).toEqual([]);
  const h = harness({ glaccounts: [...base, ...references] });
  expect(await h.run({ kind: "product" })).toBe(8);
  expect(writes(h.calls)).toHaveLength(1);
  expect(writes(h.calls)[0]).toMatchObject({
    method: "POST",
    path: "loanproducts",
    key: "stable-test-key",
    body: {
      shortName: "OFPL",
      externalId: "openfinacle-personal-v1",
      currencyCode: "INR",
      digitsAfterDecimal: 2,
      minPrincipal: 10000,
      maxPrincipal: 500000,
      minNumberOfRepayments: 12,
      maxNumberOfRepayments: 36,
      interestRatePerPeriod: 1,
      interestRateFrequencyType: 2,
      interestType: 0,
      amortizationType: 1,
      accountingRule: 2,
      charges: [],
      multiDisburseLoan: false,
      isInterestRecalculationEnabled: false,
      loanScheduleType: "CUMULATIVE",
      loanScheduleProcessingType: "HORIZONTAL",
      ...Object.fromEntries(
        Object.entries(mappings).map(([field, value]) => [
          `${field}Id`,
          value.id,
        ]),
      ),
    },
  });
  expect(Object.keys(mappings)).toHaveLength(18);
  expect(h.calls.at(-1)?.path).toBe("loanproducts/8");
});

test("malformed setup input and keys never reach the core", async () => {
  for (const key of ["", "short", "bad key value", "x".repeat(101)]) {
    const h = harness();
    expect((await h.denied({ kind: "product" }, key)).status).toBe(400);
    expect(h.calls).toEqual([]);
  }
  const h = harness();
  // Deliberately cross the typed boundary as an untrusted API caller would.
  const bad = JSON.parse('{"kind":"account","code":"OF1001"}') as LoanSetupStep;
  expect((await h.denied(bad)).status).toBe(400);
  expect(h.calls).toEqual([]);
});

test("core write failures preserve certainty and never retry, while all acknowledgement/read-back failures remain uncertain", async () => {
  const step: LoanSetupStep = { kind: "account", code: "OF1002" };
  for (const failure of [
    { method: "POST", path: "glaccounts", status: 422, uncertain: false },
    { method: "POST", path: "glaccounts", status: 409, uncertain: true },
  ]) {
    const h = harness({}, failure);
    const error = await h.denied(step);
    expect(error.uncertain).toBe(failure.uncertain);
    expect(error.status).toBe(failure.status);
    expect(writes(h.calls)).toHaveLength(1);
  }
  for (const changes of [
    { "POST glaccounts": {} },
    { "POST glaccounts": { resourceId: 0 } },
    { "glaccounts/3": { ...references[0], id: 99 } },
    { "glaccounts/3": { ...references[0], glCode: "OTHER" } },
  ]) {
    const h = harness(changes);
    expect((await h.denied(step)).uncertain).toBe(true);
    expect(writes(h.calls)).toHaveLength(1);
  }
  const h = harness(
    {},
    { method: "GET", path: "glaccounts/3", status: 503, uncertain: false },
  );
  expect((await h.denied(step)).uncertain).toBe(true);
  expect(writes(h.calls)).toHaveLength(1);
  const productFailure = harness({
    glaccounts: [...base, ...references],
    "loanproducts/8": { ...product, accountingMappings: {} },
  });
  expect((await productFailure.denied({ kind: "product" })).uncertain).toBe(
    true,
  );
  expect(writes(productFailure.calls)).toHaveLength(1);
});

test("fixed-rate product creation omits response-only and disabled-feature-only parameters while retaining disabled feature flags", async () => {
  const h = harness({ glaccounts: [...base, ...references] });
  expect(await h.run({ kind: "product" })).toBe(8);
  const body = writes(h.calls)[0].body as Record<string, unknown>;
  for (const field of [
    "isRatesEnabled",
    "isFloatingInterestRateCalculationAllowed",
    "enableAutoRepaymentForDownPayment",
  ])
    expect(Object.hasOwn(body, field)).toBe(false);
  expect(body).toMatchObject({
    isLinkedToFloatingInterestRates: false,
    enableDownPayment: false,
    interestRatePerPeriod: 1,
    charges: [],
  });
});
