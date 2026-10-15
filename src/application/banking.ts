import { Effect } from "effect";
import {
  type Account,
  type Application,
  type Bank,
  type BankingCommand,
  BankingError,
  type Beneficiary,
  bankingDate,
  type CommandKind,
  canApprove,
  dateFields,
  moneyToMinor,
  type Session,
} from "../domain/banking";
import { Core, Store } from "../domain/ports";

interface Created {
  resourceId: number;
  savingsId?: number;
}
const audit = (bank: string, actor: string, action: string, detail: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO audit(id,bank_id,actor,action,detail) VALUES(?,?,?,?,?)",
      crypto.randomUUID(),
      bank,
      actor,
      action,
      detail,
    );
  });
export const requiredBank = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=?",
      session.bank_id,
    );
    if (bank?.status !== "ready")
      return yield* Effect.fail(
        new BankingError({
          message: "This demo workspace is not ready. Start a new demo.",
          status: 409,
        }),
      );
    return bank;
  });
export const requireStaff = (session: Session) =>
  session.role === "customer"
    ? Effect.fail(
        new BankingError({ message: "A staff role is required.", status: 403 }),
      )
    : Effect.void;
const requireAccount = (bank: Bank) =>
  bank.customer_account > 0
    ? Effect.succeed(bank.customer_account)
    : Effect.fail(
        new BankingError({
          message: "Open and approve your account first.",
          status: 409,
        }),
      );

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
  if (exists) return { product: Number(exists.value), initialized: true };
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

const openAccount = (
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
    const today = bankingDate();
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

export const startBank = Effect.gen(function* () {
  const store = yield* Store;
  const core = yield* Core;
  yield* core.request("GET", "offices/1");
  const id = crypto.randomUUID();
  yield* store.run("INSERT INTO banks(id) VALUES(?)", id);
  const recipient = yield* openAccount(id, "recipient", "Arjun", "Raman", 2500);
  const employer = yield* openAccount(
    id,
    "employer",
    "Northstar",
    "Studio",
    500000,
  );
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
    "Arjun and Northstar Studio have core-backed accounts. Your customer journey begins with an application.",
  );
  return id;
});

export const dashboard = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* requiredBank(session);
    const account = bank.customer_account
      ? yield* core.request<Account>(
          "GET",
          `savingsaccounts/${bank.customer_account}?associations=transactions`,
        )
      : null;
    const recipient = yield* core.request<Account>(
      "GET",
      `savingsaccounts/${bank.recipient_account}?associations=transactions`,
    );
    const employer =
      session.role === "customer"
        ? null
        : yield* core.request<Account>(
            "GET",
            `savingsaccounts/${bank.employer_account}?associations=transactions`,
          );
    const application = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      bank.id,
    );
    const beneficiaries = yield* store.all<Beneficiary>(
      "SELECT * FROM beneficiaries WHERE bank_id=? ORDER BY created_at DESC",
      bank.id,
    );
    const commands = yield* store.all<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
      bank.id,
    );
    const events = yield* store.all(
      "SELECT * FROM audit WHERE bank_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
      bank.id,
    );
    const documents = yield* store.all(
      "SELECT id,name,kind,size,created_at FROM documents WHERE bank_id=?",
      bank.id,
    );
    const requests = yield* store.all(
      "SELECT * FROM service_requests WHERE bank_id=? ORDER BY created_at DESC",
      bank.id,
    );
    return {
      bank: { id: bank.id, created_at: bank.created_at },
      role: session.role,
      account,
      recipient: {
        id: recipient.id,
        accountNo: recipient.accountNo,
        clientName: recipient.clientName,
        ...(session.role === "customer" ? {} : { summary: recipient.summary }),
      },
      employer,
      application,
      beneficiaries,
      commands,
      audit: events,
      documents,
      requests,
      core: { engine: "Apache Fineract", version: "1.15.0", connected: true },
      businessDate: bankingDate(),
    };
  });

export interface ApplicationInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  employment: string;
}
export const submitApplication = (session: Session, input: ApplicationInput) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    if (session.role !== "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Submit the application as the customer.",
          status: 403,
        }),
      );
    if (bank.customer_account)
      return yield* Effect.fail(
        new BankingError({
          message: "Your account is already open.",
          status: 409,
        }),
      );
    if (
      !input.name.trim() ||
      !input.email.includes("@") ||
      input.phone.length < 8 ||
      input.address.length < 8
    )
      return yield* Effect.fail(
        new BankingError({
          message: "Complete your name, email, phone and address.",
          status: 400,
        }),
      );
    const docs = yield* store.all<{ kind: string }>(
      "SELECT kind FROM documents WHERE bank_id=?",
      bank.id,
    );
    if (
      !docs.some((d) => d.kind === "identity") ||
      !docs.some((d) => d.kind === "address")
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "Attach synthetic identity and address documents before submitting.",
          status: 400,
        }),
      );
    const existing = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      bank.id,
    );
    if (existing && !["needs_changes", "submitted"].includes(existing.status))
      return yield* Effect.fail(
        new BankingError({
          message: "This application is already being processed.",
          status: 409,
        }),
      );
    yield* store.run(
      "INSERT INTO applications(id,bank_id,name,email,phone,address,employment,status,maker) VALUES(?,?,?,?,?,?,?,'submitted','customer') ON CONFLICT(bank_id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,address=excluded.address,employment=excluded.employment,status='submitted',review_note=NULL",
      existing?.id ?? crypto.randomUUID(),
      bank.id,
      input.name.trim(),
      input.email,
      input.phone,
      input.address,
      input.employment,
    );
    yield* audit(
      bank.id,
      session.role,
      "Account application submitted",
      `${input.name}: identity and address documents supplied.`,
    );
    return { status: "submitted" };
  });

export const reviewApplication = (
  session: Session,
  decision: string,
  note: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    yield* requireStaff(session);
    const app = yield* store.one<Application>(
      "SELECT * FROM applications WHERE bank_id=?",
      bank.id,
    );
    if (!app)
      return yield* Effect.fail(
        new BankingError({ message: "No application to review.", status: 404 }),
      );
    if (decision === "needs_changes" || decision === "recommend") {
      if (session.role !== "officer" || app.status !== "submitted")
        return yield* Effect.fail(
          new BankingError({
            message: "The bank officer must review a submitted application.",
            status: 409,
          }),
        );
      yield* store.run(
        "UPDATE applications SET status=?,review_note=?,maker='officer' WHERE id=? AND status='submitted'",
        decision === "recommend" ? "awaiting_approval" : "needs_changes",
        note || "Documents reviewed",
        app.id,
      );
      yield* audit(
        bank.id,
        session.role,
        decision === "recommend"
          ? "Application recommended"
          : "Additional information requested",
        note || "Identity and address reviewed.",
      );
      return {
        status:
          decision === "recommend" ? "awaiting_approval" : "needs_changes",
      };
    }
    if (
      decision !== "approve" ||
      !canApprove(session.role, app.maker) ||
      app.status !== "awaiting_approval"
    )
      return yield* Effect.fail(
        new BankingError({
          message:
            "A separate approver must approve a recommended application.",
          status: 403,
        }),
      );
    const claimed = yield* store.run(
      "UPDATE applications SET status='opening' WHERE id=? AND status='awaiting_approval'",
      app.id,
    );
    if (!claimed)
      return yield* Effect.fail(
        new BankingError({
          message: "Account opening is already in progress.",
          status: 409,
        }),
      );
    const names = app.name.trim().split(/\s+/);
    const opened = yield* openAccount(
      bank.id,
      "customer",
      names[0],
      names.slice(1).join(" ") || "Customer",
      0,
    ).pipe(
      Effect.tapError((error) =>
        store.run(
          "UPDATE applications SET status='opening_exception',review_note=? WHERE id=?",
          error.message,
          app.id,
        ),
      ),
    );
    yield* store.run(
      "UPDATE banks SET customer_client=?,customer_account=? WHERE id=?",
      opened.client,
      opened.account,
      bank.id,
    );
    yield* store.run(
      "UPDATE applications SET status='approved',review_note=? WHERE id=?",
      "Account opened and activated in Apache Fineract",
      app.id,
    );
    yield* audit(
      bank.id,
      session.role,
      "Savings account opened",
      `Fineract account ${opened.account}; approved separately from document review.`,
    );
    return { status: "approved", accountId: opened.account };
  });

export const addBeneficiary = (session: Session, name: string) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Add beneficiaries as the customer.",
          status: 403,
        }),
      );
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* requiredBank(session);
    yield* requireAccount(bank);
    const account = yield* core.request<Account>(
      "GET",
      `savingsaccounts/${bank.recipient_account}`,
    );
    const id = crypto.randomUUID();
    yield* store.run(
      "INSERT OR IGNORE INTO beneficiaries(id,bank_id,name,account_id,account_no,status) VALUES(?,?,?,?,?,'pending')",
      id,
      bank.id,
      name.trim() || "Arjun Raman",
      account.id,
      account.accountNo,
    );
    yield* audit(
      bank.id,
      session.role,
      "Beneficiary added",
      "Pending simulated verification; transfers remain disabled until confirmation.",
    );
    return { id, status: "pending" };
  });
export const confirmBeneficiary = (
  session: Session,
  id: string,
  code: string,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Confirm beneficiaries as the customer.",
          status: 403,
        }),
      );
    if (code !== "246810")
      return yield* Effect.fail(
        new BankingError({
          message: "Use the displayed demo verification code, 246810.",
          status: 400,
        }),
      );
    const store = yield* Store;
    const changed = yield* store.run(
      "UPDATE beneficiaries SET status='active' WHERE bank_id=? AND id=? AND status='pending'",
      session.bank_id,
      id,
    );
    if (!changed)
      return yield* Effect.fail(
        new BankingError({
          message: "Pending beneficiary not found.",
          status: 404,
        }),
      );
    yield* audit(
      session.bank_id,
      session.role,
      "Beneficiary activated",
      "Demo OTP confirmed. No real SMS was sent.",
    );
    return { status: "active" };
  });

export interface CommandInput {
  kind: CommandKind;
  amount?: number;
  description?: string;
  beneficiaryId?: string;
  originalId?: string;
}
export const createCommand = (
  session: Session,
  input: CommandInput,
  key: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* requiredBank(session);
    const accountId = yield* requireAccount(bank);
    if (key.length < 10 || key.length > 100)
      return yield* Effect.fail(
        new BankingError({
          message: "A valid idempotency key is required.",
          status: 400,
        }),
      );
    const existing = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? AND key=?",
      bank.id,
      key,
    );
    if (existing) {
      if (existing.payload !== JSON.stringify(input))
        return yield* Effect.fail(
          new BankingError({
            message: "This idempotency key belongs to a different request.",
            status: 409,
          }),
        );
      if (["failed", "uncertain", "executing"].includes(existing.status))
        return yield* Effect.fail(
          new BankingError({
            message:
              existing.error ??
              `Instruction is ${existing.status}; inspect its state before retrying.`,
            status: 409,
            uncertain: existing.status !== "failed",
          }),
        );
      return existing;
    }
    const unresolved = yield* store.one<{ id: string }>(
      "SELECT id FROM commands WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain') LIMIT 1",
      bank.id,
      accountId,
    );
    if (unresolved)
      return yield* Effect.fail(
        new BankingError({
          message:
            "An earlier instruction is still processing or requires reconciliation. Inspect it before starting another financial instruction.",
          status: 409,
        }),
      );
    const allowed: CommandKind[] =
      session.role === "customer"
        ? ["transfer"]
        : session.role === "officer"
          ? ["deposit", "withdrawal", "salary", "freeze", "unfreeze", "reverse"]
          : [];
    if (!allowed.includes(input.kind))
      return yield* Effect.fail(
        new BankingError({
          message: "This persona cannot initiate that operation.",
          status: 403,
        }),
      );
    const amount = ["freeze", "unfreeze", "reverse"].includes(input.kind)
      ? 0
      : yield* Effect.try({
          try: () => moneyToMinor(input.amount ?? 0),
          catch: () =>
            new BankingError({
              message:
                "Enter a positive amount with at most two decimal places.",
              status: 400,
            }),
        });
    if (input.kind === "transfer") {
      const beneficiary = yield* store.one<Beneficiary>(
        "SELECT * FROM beneficiaries WHERE id=? AND bank_id=? AND status='active'",
        input.beneficiaryId ?? "",
        bank.id,
      );
      if (!beneficiary)
        return yield* Effect.fail(
          new BankingError({
            message: "Select an active beneficiary.",
            status: 400,
          }),
        );
    }
    if (input.kind === "reverse") {
      const original = yield* store.one<BankingCommand>(
        "SELECT * FROM commands WHERE id=? AND bank_id=? AND status='posted'",
        input.originalId ?? "",
        bank.id,
      );
      if (!original || !["deposit", "withdrawal"].includes(original.kind))
        return yield* Effect.fail(
          new BankingError({
            message:
              "Only a posted cash deposit or withdrawal can be reversed here.",
            status: 400,
          }),
        );
      const prior = yield* store.one<BankingCommand>(
        "SELECT * FROM commands WHERE bank_id=? AND kind='reverse' AND json_extract(payload,'$.originalId')=? AND status IN ('pending','executing','posted','uncertain')",
        bank.id,
        original.id,
      );
      if (prior)
        return yield* Effect.fail(
          new BankingError({
            message: "A reversal already exists for this transaction.",
            status: 409,
          }),
        );
    }
    const id = crypto.randomUUID();
    yield* store.run(
      "INSERT OR IGNORE INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id,payload) VALUES(?,?,?,?,'pending',?,?,?,?,?)",
      id,
      bank.id,
      key,
      input.kind,
      amount,
      input.description?.trim().slice(0, 160) || input.kind,
      session.role,
      accountId,
      JSON.stringify(input),
    );
    const command = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? AND key=?",
      bank.id,
      key,
    );
    if (!command)
      return yield* Effect.fail(
        new BankingError({
          message: "Command persistence failed.",
          status: 503,
        }),
      );
    if (command.payload !== JSON.stringify(input))
      return yield* Effect.fail(
        new BankingError({
          message: "This idempotency key belongs to a different request.",
          status: 409,
        }),
      );
    yield* audit(
      bank.id,
      session.role,
      "Instruction created",
      `${input.kind}: ${amount / 100} INR`,
    );
    if (input.kind === "transfer" && amount <= 2500000)
      return yield* executeCommand(session, command.id, true);
    return command;
  });

export const executeCommand = (
  session: Session,
  id: string,
  straightThrough = false,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* requiredBank(session);
    const command = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE id=? AND bank_id=?",
      id,
      bank.id,
    );
    if (!command)
      return yield* Effect.fail(
        new BankingError({ message: "Instruction not found.", status: 404 }),
      );
    if (command.status !== "pending") return command;
    const automatic =
      straightThrough &&
      command.kind === "transfer" &&
      command.amount_minor <= 2500000 &&
      session.role === "customer" &&
      command.maker === "customer";
    if (!automatic && !canApprove(session.role, command.maker))
      return yield* Effect.fail(
        new BankingError({
          message: "A separate approver must authorise this instruction.",
          status: 403,
        }),
      );
    const claim = yield* store.run(
      "UPDATE commands SET status='executing',approver=? WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM commands other WHERE other.bank_id=? AND other.account_id=? AND other.id<>? AND other.status IN ('executing','uncertain'))",
      automatic ? "policy:retail-transfer" : session.role,
      command.id,
      bank.id,
      command.account_id,
      command.id,
    );
    if (!claim)
      return yield* Effect.fail(
        new BankingError({
          message:
            "This or another instruction is processing or requires reconciliation.",
          status: 409,
        }),
      );
    const payload = JSON.parse(command.payload) as CommandInput;
    const posting = Effect.gen(function* () {
      const today = bankingDate();
      const fields = dateFields();
      if (command.kind === "freeze" || command.kind === "unfreeze") {
        return yield* core.request<Created>(
          "POST",
          `savingsaccounts/${bank.customer_account}?command=${command.kind === "freeze" ? "blockDebit" : "unblockDebit"}`,
          command.kind === "freeze"
            ? { reasonForBlock: command.description }
            : {},
          command.id,
        );
      }
      if (command.kind === "reverse") {
        const original = yield* store.one<BankingCommand>(
          "SELECT * FROM commands WHERE id=? AND bank_id=?",
          payload.originalId ?? "",
          bank.id,
        );
        if (!original?.core_id)
          return yield* Effect.fail(
            new BankingError({
              message: "Original posting cannot be located.",
              status: 409,
            }),
          );
        return yield* core.request<Created>(
          "POST",
          `savingsaccounts/${bank.customer_account}/transactions/${original.core_id}?command=undo`,
          {},
          command.id,
        );
      }
      if (["transfer", "salary"].includes(command.kind)) {
        const fromClient =
          command.kind === "salary"
            ? bank.employer_client
            : bank.customer_client;
        const fromAccount =
          command.kind === "salary"
            ? bank.employer_account
            : bank.customer_account;
        const toClient =
          command.kind === "salary"
            ? bank.customer_client
            : bank.recipient_client;
        const toAccount =
          command.kind === "salary"
            ? bank.customer_account
            : bank.recipient_account;
        return yield* core.request<Created>(
          "POST",
          "accounttransfers",
          {
            fromOfficeId: "1",
            toOfficeId: "1",
            fromClientId: String(fromClient),
            toClientId: String(toClient),
            fromAccountType: "2",
            toAccountType: "2",
            fromAccountId: String(fromAccount),
            toAccountId: String(toAccount),
            transferDate: today,
            transferAmount: String(command.amount_minor / 100),
            transferDescription: command.description,
            ...fields,
          },
          command.id,
        );
      }
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
      return yield* core.request<Created>(
        "POST",
        `savingsaccounts/${bank.customer_account}/transactions?command=${command.kind}`,
        {
          transactionDate: today,
          transactionAmount: command.amount_minor / 100,
          paymentTypeId: Number(cash.value),
          receiptNumber: command.id,
          ...fields,
        },
        command.id,
      );
    });
    const result = yield* posting.pipe(
      Effect.tapError((error) =>
        store.run(
          "UPDATE commands SET status=?,error=? WHERE id=?",
          error.uncertain ? "uncertain" : "failed",
          error.message,
          command.id,
        ),
      ),
    );
    yield* store.run(
      "UPDATE commands SET status='posted',core_id=? WHERE id=?",
      result.resourceId,
      command.id,
    );
    yield* audit(
      bank.id,
      automatic ? "policy" : session.role,
      "Instruction posted",
      `${command.kind}: core reference ${result.resourceId}`,
    );
    return {
      ...command,
      status: "posted" as const,
      core_id: result.resourceId,
    };
  });

export const rejectCommand = (session: Session, id: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    if (session.role !== "approver")
      return yield* Effect.fail(
        new BankingError({ message: "Approver role required.", status: 403 }),
      );
    const changed = yield* store.run(
      "UPDATE commands SET status='rejected',approver=? WHERE id=? AND bank_id=? AND status='pending'",
      session.role,
      id,
      session.bank_id,
    );
    if (!changed)
      return yield* Effect.fail(
        new BankingError({
          message: "Pending instruction not found.",
          status: 404,
        }),
      );
    yield* audit(session.bank_id, session.role, "Instruction rejected", id);
    return { status: "rejected" };
  });
