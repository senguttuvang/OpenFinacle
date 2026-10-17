import { Effect, Layer, Schema } from "effect";
import { BankingError } from "../domain/banking";
import {
  LoanCatalogue,
  type LoanCatalogueInventory,
  type LoanLedgerCode,
  LoanSetupStep,
  loanLedgerDefinitions,
} from "../domain/loan-product";
import { Core } from "../domain/ports";
import { coreLoanProductShape } from "./loan-engine";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const Identity = Schema.Struct({ id, glCode: Schema.NonEmptyString });
const Account = Schema.Struct({
  ...Identity.fields,
  name: Schema.NonEmptyString,
  type: Schema.Struct({ id }),
  usage: Schema.Struct({ id: Schema.Literal(1) }),
  disabled: Schema.Literal(false),
  manualEntriesAllowed: Schema.Literal(true),
});
const Activity = Schema.Struct({
  financialActivityData: Schema.Struct({ id }),
  glAccountData: Schema.Struct({ id }),
});
const ProductIdentity = Schema.Struct({
  id,
  shortName: Schema.NonEmptyString,
  externalId: Schema.optional(Schema.NullOr(Schema.String)),
});
const Product = Schema.Struct({
  ...coreLoanProductShape.fields,
  name: Schema.Literal("OpenFinacle Personal Loan"),
  externalId: Schema.Literal("openfinacle-personal-v1"),
  accountingMappings: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({ id }),
  }),
});
const mappingDefinitions = {
  fundSourceAccount: "cash",
  loanPortfolioAccount: "OF1002",
  transfersInSuspenseAccount: "OF1003",
  overpaymentLiabilityAccount: "OF2003",
  interestOnLoanAccount: "OF4002",
  incomeFromFeeAccount: "OF4002",
  incomeFromPenaltyAccount: "OF4002",
  incomeFromRecoveryAccount: "OF4002",
  writeOffAccount: "OF5002",
  goodwillCreditAccount: "OF5002",
  chargeOffExpenseAccount: "OF5002",
  chargeOffFraudExpenseAccount: "OF5002",
  incomeFromChargeOffInterestAccount: "OF4002",
  incomeFromChargeOffFeesAccount: "OF4002",
  incomeFromChargeOffPenaltyAccount: "OF4002",
  incomeFromGoodwillCreditInterestAccount: "OF4002",
  incomeFromGoodwillCreditFeesAccount: "OF4002",
  incomeFromGoodwillCreditPenaltyAccount: "OF4002",
} as const;
const kindIds = { asset: 1, liability: 2, income: 4, expense: 5 } as const;
const invalid = (message: string, status = 503) =>
  new BankingError({ message, status });
const decode = <A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
  message: string,
  status = 503,
) =>
  Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError(() => invalid(message, status)),
  );
const completeMappings = (inventory: LoanCatalogueInventory) =>
  Effect.gen(function* () {
    const accounts = yield* decode(
      Schema.Record({
        key: Schema.Literal("OF1002", "OF1003", "OF2003", "OF4002", "OF5002"),
        value: id,
      }),
      inventory.accounts,
      "Verify all five loan reference accounts before creating the product.",
      409,
    );
    return Object.fromEntries(
      Object.entries(mappingDefinitions).map(
        ([field, code]) =>
          [
            field,
            code === "cash" ? inventory.cash_id : accounts[code],
          ] as const,
      ),
    );
  });
const verifyAccount = (
  raw: unknown,
  definition: { code: string; name: string; kind: keyof typeof kindIds },
  expectedId?: number,
) =>
  Effect.gen(function* () {
    const account = yield* decode(
      Account,
      raw,
      "A reference ledger account has unsupported flags. Inspect core setup.",
    );
    if (
      account.glCode !== definition.code ||
      account.name !== definition.name ||
      account.type.id !== kindIds[definition.kind] ||
      (expectedId !== undefined && account.id !== expectedId)
    )
      return yield* Effect.fail(
        invalid(
          "A reference ledger identity or type conflicts with the loan setup contract.",
        ),
      );
    return account.id;
  });
const verifyProduct = (
  raw: unknown,
  inventory: LoanCatalogueInventory,
  expectedId: number,
) =>
  Effect.gen(function* () {
    const product = yield* decode(
      Product,
      raw,
      "The existing core loan product conflicts with the configured demo contract.",
    );
    const expected = yield* completeMappings(inventory);
    if (
      product.id !== expectedId ||
      Object.entries(expected).some(
        ([field, accountId]) =>
          product.accountingMappings[field]?.id !== accountId,
      )
    )
      return yield* Effect.fail(
        invalid(
          "The core loan product accounting mappings could not be verified.",
        ),
      );
    return product.id;
  });
const productPayload = (mappings: Record<string, number>) => ({
  name: "OpenFinacle Personal Loan",
  shortName: "OFPL",
  externalId: "openfinacle-personal-v1",
  description:
    "Synthetic INR personal lending through the OpenFinacle demonstration core",
  locale: "en",
  currencyCode: "INR",
  digitsAfterDecimal: 2,
  inMultiplesOf: 0,
  principal: 10000,
  minPrincipal: 10000,
  maxPrincipal: 500000,
  numberOfRepayments: 12,
  minNumberOfRepayments: 12,
  maxNumberOfRepayments: 36,
  repaymentEvery: 1,
  repaymentFrequencyType: 2,
  interestRatePerPeriod: 1,
  minInterestRatePerPeriod: 1,
  maxInterestRatePerPeriod: 1,
  interestRateFrequencyType: 2,
  amortizationType: 1,
  interestType: 0,
  interestCalculationPeriodType: 1,
  transactionProcessingStrategyCode: "mifos-standard-strategy",
  accountingRule: 2,
  daysInMonthType: 1,
  daysInYearType: 1,
  inArrearsTolerance: 0,
  multiDisburseLoan: false,
  isInterestRecalculationEnabled: false,
  canDefineInstallmentAmount: false,
  allowVariableInstallments: false,
  isLinkedToFloatingInterestRates: false,
  canUseForTopup: false,
  enableDownPayment: false,
  isEqualAmortization: false,
  interestRecognitionOnDisbursementDate: false,
  enableIncomeCapitalization: false,
  enableBuyDownFee: false,
  holdGuaranteeFunds: false,
  allowPartialPeriodInterestCalculation: false,
  includeInBorrowerCycle: false,
  useBorrowerCycle: false,
  loanScheduleType: "CUMULATIVE",
  loanScheduleProcessingType: "HORIZONTAL",
  charges: [],
  ...Object.fromEntries(
    Object.entries(mappings).map(
      ([field, accountId]) => [`${field}Id`, accountId] as const,
    ),
  ),
});

export const loanCatalogueLayer = Layer.effect(
  LoanCatalogue,
  Effect.gen(function* () {
    const core = yield* Core;
    const inventory = () =>
      Effect.gen(function* () {
        const result = yield* Effect.all(
          {
            accounts: core.request("GET", "glaccounts"),
            activities: core.request("GET", "financialactivityaccounts"),
            products: core.request("GET", "loanproducts"),
          },
          { concurrency: 3 },
        );
        const rawAccounts = yield* decode(
          Schema.Array(Schema.Unknown),
          result.accounts,
          "Could not verify the complete ledger reference list.",
        );
        const accounts = yield* Effect.forEach(rawAccounts, (raw) =>
          decode(
            Identity,
            raw,
            "A ledger reference identity could not be verified.",
          ).pipe(Effect.map((identity) => ({ ...identity, raw }))),
        );
        const find = (
          definition: {
            code: string;
            name: string;
            kind: keyof typeof kindIds;
          },
          required: boolean,
        ) =>
          Effect.gen(function* () {
            const matching = accounts.filter(
              (account) => account.glCode === definition.code,
            );
            if (matching.length > 1 || (required && matching.length !== 1))
              return yield* Effect.fail(
                invalid(
                  "Base ledger references are missing or duplicated. Inspect existing savings setup; no accounts were created.",
                ),
              );
            return matching[0]
              ? yield* verifyAccount(matching[0].raw, definition)
              : null;
          });
        const cash = yield* find(
          { code: "OF1001", name: "Cash and settlement", kind: "asset" },
          true,
        );
        const clearing = yield* find(
          { code: "OF2002", name: "Transfer clearing", kind: "liability" },
          true,
        );
        if (cash === null || clearing === null)
          return yield* Effect.fail(
            invalid("Base cash and transfer references are unavailable."),
          );
        const activities = yield* decode(
          Schema.Array(Activity),
          result.activities,
          "The core financial-activity mappings could not be verified.",
        );
        const transfers = activities.filter(
          (activity) => activity.financialActivityData.id === 200,
        );
        if (
          transfers.length !== 1 ||
          transfers[0].glAccountData.id !== clearing
        )
          return yield* Effect.fail(
            invalid(
              "Preserve and verify the existing savings liability-transfer mapping before loan setup.",
            ),
          );
        const found: Record<LoanLedgerCode, number | null> = {
          OF1002: null,
          OF1003: null,
          OF2003: null,
          OF4002: null,
          OF5002: null,
        };
        for (const definition of loanLedgerDefinitions)
          found[definition.code] = yield* find(definition, false);
        const products = yield* decode(
          Schema.Array(ProductIdentity),
          result.products,
          "Could not verify the complete loan-product reference list.",
        );
        const matching = products.filter(
          (product) =>
            product.shortName === "OFPL" ||
            product.externalId === "openfinacle-personal-v1",
        );
        if (matching.length > 1)
          return yield* Effect.fail(
            invalid(
              "The loan product identity is duplicated. Inspect setup without recreating it.",
            ),
          );
        const snapshot: LoanCatalogueInventory = {
          cash_id: cash,
          clearing_id: clearing,
          accounts: found,
          product_id: null,
        };
        if (matching[0])
          snapshot.product_id = yield* verifyProduct(
            yield* core.request("GET", `loanproducts/${matching[0].id}`),
            snapshot,
            matching[0].id,
          );
        return snapshot;
      });
    return {
      inventory,
      execute: (input: LoanSetupStep, key: string) =>
        Effect.gen(function* () {
          const step = yield* Schema.decodeUnknown(LoanSetupStep, {
            onExcessProperty: "error",
          })(input).pipe(
            Effect.mapError(() =>
              invalid("Choose a supported loan configuration step.", 400),
            ),
          );
          yield* decode(
            Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
            key,
            "Use the original stable configuration key.",
            400,
          );
          const current = yield* inventory();
          const existing =
            step.kind === "account"
              ? current.accounts[step.code]
              : current.product_id;
          if (existing !== null) return existing;
          const definition =
            step.kind === "account"
              ? loanLedgerDefinitions.find((item) => item.code === step.code)
              : null;
          if (step.kind === "account" && !definition)
            return yield* Effect.fail(
              invalid("Unknown loan ledger reference.", 400),
            );
          const path = step.kind === "account" ? "glaccounts" : "loanproducts";
          const body = definition
            ? {
                glCode: definition.code,
                name: definition.name,
                type: kindIds[definition.kind],
                usage: 1,
                manualEntriesAllowed: true,
              }
            : productPayload(yield* completeMappings(current));
          const receipt = yield* core.request("POST", path, body, key);
          // Any acknowledgement/read-back failure after this POST remains uncertain.
          return yield* Effect.gen(function* () {
            const created = yield* decode(
              Schema.Struct({ resourceId: id }),
              receipt,
              "The core reference creation acknowledgement could not be verified.",
            );
            const raw = yield* core.request(
              "GET",
              `${path}/${created.resourceId}`,
            );
            return definition
              ? yield* verifyAccount(raw, definition, created.resourceId)
              : yield* verifyProduct(raw, current, created.resourceId);
          }).pipe(
            Effect.mapError(
              (error) =>
                new BankingError({
                  message: error.message,
                  status: error.status,
                  uncertain: true,
                }),
            ),
          );
        }),
    };
  }),
);
