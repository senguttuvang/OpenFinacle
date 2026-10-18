import { Clock, Effect } from "effect";
import {
  audit,
  type Created,
} from "../../platform/banking-workspace/application/workspace-context";
import {
  type Account,
  BankingError,
  bankingDate,
  type CustomerJourney,
  dateFields,
} from "../../platform/banking-workspace/domain/banking";
import { Core, Store } from "../../platform/banking-workspace/domain/ports";
export const bootstrap = Effect.gen(function* () {
  const store = yield* Store;
  const core = yield* Core;
  const paymentSetting = yield* store.one<{ value: string }>(
    "SELECT value FROM settings WHERE key='cash_payment_type'",
  );
  if (!paymentSetting) {
    const types = yield* core.request<
      { id: number; name: string; isCashPayment: boolean }[]
    >("GET", "paymenttypes");
    const cash =
      types.find((type) => type.isCashPayment)?.id ??
      (yield* core.request<Created>(
        "POST",
        "paymenttypes",
        {
          name: "OpenFinacle Cash",
          description: "Cash at the demonstration branch",
          isCashPayment: true,
          position: 1,
        },
        "of-cash-payment-type",
      )).resourceId;
    yield* store.run(
      "INSERT OR IGNORE INTO settings(key,value) VALUES('cash_payment_type',?)",
      String(cash),
    );
  }
  const exists = yield* store.one<{ value: string }>(
    "SELECT value FROM settings WHERE key='savings_product'",
  );
  yield* core.request(
    "PUT",
    "currencies",
    { currencies: ["INR"] },
    "of-currencies",
  );
  const gls: Record<string, number> = {};
  const existing = yield* core.request<{ id: number; glCode: string }[]>(
    "GET",
    "glaccounts",
  );
  for (const [name, type, code] of [
    ["Cash and settlement", 1, "OF1001"],
    ["Customer deposits", 2, "OF2001"],
    ["Transfer clearing", 2, "OF2002"],
    ["Interest expense", 5, "OF5001"],
    ["Service income", 4, "OF4001"],
  ] as const) {
    const found = existing.find((a) => a.glCode === code);
    gls[code] =
      found?.id ??
      (yield* core.request<Created>(
        "POST",
        "glaccounts",
        { name, glCode: code, type, usage: 1, manualEntriesAllowed: true },
        `of-gl-${code}`,
      )).resourceId;
  }
  const mappings = yield* core.request<
    { financialActivityData: { id: number } }[]
  >("GET", "financialactivityaccounts");
  if (!mappings.some((mapping) => mapping.financialActivityData.id === 200))
    yield* core.request(
      "POST",
      "financialactivityaccounts",
      { financialActivityId: 200, glAccountId: gls.OF2002 },
      "of-savings-transfer-accounting",
    );
  if (exists) return { product: Number(exists.value), initialized: true };
  const products = yield* core.request<{ id: number; shortName: string }[]>(
    "GET",
    "savingsproducts",
  );
  const product =
    products.find((p) => p.shortName === "OFSV")?.id ??
    (yield* core.request<Created>(
      "POST",
      "savingsproducts",
      {
        name: "OpenFinacle Everyday Savings",
        shortName: "OFSV",
        description: "Everyday INR savings for the OpenFinacle demonstration",
        currencyCode: "INR",
        digitsAfterDecimal: 2,
        inMultiplesOf: 0,
        nominalAnnualInterestRate: 3.5,
        interestCompoundingPeriodType: 4,
        interestPostingPeriodType: 4,
        interestCalculationType: 1,
        interestCalculationDaysInYearType: 365,
        minRequiredOpeningBalance: 0,
        accountingRule: 2,
        savingsReferenceAccountId: gls.OF1001,
        savingsControlAccountId: gls.OF2001,
        transfersInSuspenseAccountId: gls.OF2002,
        interestOnSavingsAccountId: gls.OF5001,
        incomeFromFeeAccountId: gls.OF4001,
        incomeFromPenaltyAccountId: gls.OF4001,
        overdraftPortfolioControlId: gls.OF1001,
        incomeFromInterestId: gls.OF4001,
        writeOffAccountId: gls.OF5001,
        locale: "en",
      },
      "of-savings-product-v2",
    )).resourceId;
  yield* store.run(
    "INSERT OR IGNORE INTO settings(key,value) VALUES('savings_product',?)",
    String(product),
  );
  return { product, initialized: true };
});

export const openAccount = (
  bank: string,
  suffix: string,
  firstname: string,
  lastname: string,
  funding: number,
) =>
  Effect.gen(function* () {
    const core = yield* Core;
    const store = yield* Store;
    const setting = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key='savings_product'",
    );
    if (!setting)
      return yield* Effect.fail(
        new BankingError({
          message: "Banking products have not been configured.",
          status: 503,
        }),
      );
    const cash = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key='cash_payment_type'",
    );
    if (!cash)
      return yield* Effect.fail(
        new BankingError({
          message: "Cash payment type has not been configured.",
          status: 503,
        }),
      );
    const today = bankingDate(yield* Clock.currentTimeMillis);
    const client = yield* core.request<Created>(
      "POST",
      "clients",
      {
        ...(suffix === "employer"
          ? { fullname: `${firstname} ${lastname}`, legalFormId: 2 }
          : { firstname, lastname, legalFormId: 1 }),
        officeId: 1,
        active: true,
        activationDate: today,
        externalId: `${bank}-${suffix}`,
        ...dateFields(),
      },
      `${bank}-${suffix}-client`,
    );
    const account = yield* core.request<Created>(
      "POST",
      "savingsaccounts",
      {
        clientId: client.resourceId,
        productId: Number(setting.value),
        submittedOnDate: today,
        externalId: `${bank}-${suffix}`,
        ...dateFields(),
      },
      `${bank}-${suffix}-account`,
    );
    yield* core.request(
      "POST",
      `savingsaccounts/${account.resourceId}?command=approve`,
      { approvedOnDate: today, ...dateFields() },
      `${bank}-${suffix}-approve`,
    );
    yield* core.request(
      "POST",
      `savingsaccounts/${account.resourceId}?command=activate`,
      { activatedOnDate: today, ...dateFields() },
      `${bank}-${suffix}-activate`,
    );
    if (funding > 0)
      yield* core.request(
        "POST",
        `savingsaccounts/${account.resourceId}/transactions?command=deposit`,
        {
          transactionDate: today,
          transactionAmount: funding,
          paymentTypeId: Number(cash.value),
          ...dateFields(),
        },
        `${bank}-${suffix}-fund`,
      );
    return { client: client.resourceId, account: account.resourceId };
  });

export const startBankWithJourney = (journey: CustomerJourney) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const core = yield* Core;
    yield* core.request("GET", "offices/1");
    const id = crypto.randomUUID();
    yield* store.run("INSERT INTO banks(id,journey) VALUES(?,?)", id, journey);
    const initialize = Effect.gen(function* () {
      const recipient = yield* openAccount(
        id,
        "recipient",
        "Arjun",
        "Raman",
        2500,
      );
      const employer = yield* openAccount(
        id,
        "employer",
        "Northstar",
        "Studio",
        500000,
      );
      if (journey === "existing") {
        const customer = yield* openAccount(
          id,
          "customer",
          "Mira",
          "Krishnan",
          40000,
        );
        yield* store.run(
          "UPDATE banks SET customer_client=?,customer_account=? WHERE id=?",
          customer.client,
          customer.account,
          id,
        );
        const today = bankingDate(yield* Clock.currentTimeMillis);
        const transfer = (
          suffix: string,
          from: typeof customer,
          to: typeof customer,
          amount: number,
          description: string,
        ) =>
          core.request<Created>(
            "POST",
            "accounttransfers",
            {
              fromOfficeId: "1",
              toOfficeId: "1",
              fromClientId: String(from.client),
              toClientId: String(to.client),
              fromAccountType: "2",
              toAccountType: "2",
              fromAccountId: String(from.account),
              toAccountId: String(to.account),
              transferDate: today,
              transferAmount: String(amount),
              transferDescription: description,
              ...dateFields(),
            },
            `${id}-seed-${suffix}`,
          );
        yield* transfer(
          "salary",
          employer,
          customer,
          85000,
          "Sample salary · Northstar Studio",
        );
        yield* transfer(
          "payment",
          customer,
          recipient,
          2500,
          "Sample shared expenses · Arjun Raman",
        );
        const cash = yield* store.one<{ value: string }>(
          "SELECT value FROM settings WHERE key='cash_payment_type'",
        );
        if (!cash)
          return yield* Effect.fail(
            new BankingError({
              message: "Cash payment type is missing.",
              status: 503,
            }),
          );
        yield* core.request(
          "POST",
          `savingsaccounts/${customer.account}/transactions?command=withdrawal`,
          {
            transactionDate: today,
            transactionAmount: 1200,
            paymentTypeId: Number(cash.value),
            ...dateFields(),
          },
          `${id}-seed-withdrawal`,
        );
        const recipientAccount = yield* core.request<Account>(
          "GET",
          `savingsaccounts/${recipient.account}`,
        );
        yield* store.run(
          "INSERT INTO beneficiaries(id,bank_id,name,account_id,account_no,status) VALUES(?,?,?,?,?,'active')",
          crypto.randomUUID(),
          id,
          "Arjun Raman",
          recipient.account,
          recipientAccount.accountNo,
        );
        yield* audit(
          id,
          "system",
          "Existing customer sample activity prepared",
          "Synthetic setup: opening funds ₹40,000, employer-funded salary ₹85,000, internal payment ₹2,500 and cash withdrawal ₹1,200. All posted today in Fineract; no historical dates invented.",
        );
      }
      yield* store.run(
        "UPDATE banks SET status='ready',recipient_client=?,recipient_account=?,employer_client=?,employer_account=? WHERE id=?",
        recipient.client,
        recipient.account,
        employer.client,
        employer.account,
        id,
      );
      yield* audit(
        id,
        "system",
        "Demo workspace opened",
        journey === "existing"
          ? "Existing customer workspace: active savings account and real core-posted synthetic sample activity. Setup is not a production account-opening control."
          : "Arjun and Northstar Studio have core-backed accounts. Your customer journey begins with an application.",
      );
    });
    yield* initialize.pipe(
      Effect.tapError(() =>
        store.run(
          "UPDATE banks SET status='initialization_exception' WHERE id=?",
          id,
        ),
      ),
    );
    return id;
  });

export const startBank = startBankWithJourney("new");
