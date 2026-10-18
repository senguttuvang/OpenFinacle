import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { Clock, Effect, Layer } from "effect";
import { financialView } from "../src/application/financial-view";
import {
  actOnLoan,
  createLoanQuote,
  submitLoanApplication,
} from "../src/application/loan-origination";
import {
  actOnRepayment,
  createRepaymentOffer,
  inspectRepayment,
  submitRepayment,
} from "../src/application/loan-repayment";
import {
  listRepayments,
  savedRepaymentDetail,
  savedRepaymentForKey,
} from "../src/application/loan-repayment-records";
import {
  advanceLoanSetup,
  loanSetupStatus,
} from "../src/application/loan-setup";
import {
  repaymentPilotReport,
  verifyRepaymentPilotResponse,
} from "../src/cli/loan-repayment-report";
import {
  type Bank,
  BankingError,
  bankingDate,
  type Session,
} from "../src/domain/banking";
import {
  type CoreLoanSnapshot,
  LoanEngine,
  type LoanEngineService,
  LoanEnquiry,
  type LoanEnquiryService,
} from "../src/domain/loan-engine";
import {
  LoanCatalogue,
  type LoanCatalogueService,
} from "../src/domain/loan-product";
import { loanRepaymentMarker } from "../src/domain/loan-repayment-identity";
import type {
  RepaymentCommand,
  RepaymentDetail,
} from "../src/domain/loan-repayment-workflow";
import {
  LoanRepayer,
  type LoanRepayerService,
  type LoanRepaymentInstruction,
  type LoanRepaymentResult,
} from "../src/domain/loan-repayments";
import { loanSetupSteps } from "../src/domain/loan-setup";
import { LoanWriter, type LoanWriterService } from "../src/domain/loan-writing";
import {
  Core,
  type CoreService,
  Store,
  type StoreService,
} from "../src/domain/ports";
import { inventedLoanStatement } from "./fixtures/loan-statement";
import {
  workflowQuote,
  workflowQuotedAt,
  workflowResult,
} from "./fixtures/loan-workflow";

let ddl = "";
beforeAll(async () => {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(path);
  ddl = (await Promise.all(paths.sort().map((p) => Bun.file(p).text()))).join(
    "\n",
  );
});
const customer: Session = {
  bank_id: "loan-test-bank",
  role: "customer",
  token_hash: "invented",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" },
  approver: Session = { ...customer, role: "approver" };
let db: Database,
  time: number,
  balance: number,
  loanId: string,
  coreLoan: CoreLoanSnapshot;
let reads: string[],
  dispatches: LoanRepaymentInstruction[],
  confirmations: LoanRepaymentInstruction[];
let writerError: BankingError | undefined,
  commitBeforeError: boolean,
  failBalance: boolean;
let failStore:
  | { phase: "reservation" | "outcome"; when: "before" | "after" }
  | undefined;
let failReservationRead: "operation" | "claim" | undefined;
let closeRelationshipAfterConfirmation: boolean;
let pause: Promise<void> | undefined, announce: (() => void) | undefined;
const sqlError = () =>
  new BankingError({
    message: "Injected persistence acknowledgement loss",
    status: 503,
  });
type Env =
  | CoreService
  | StoreService
  | LoanCatalogueService
  | LoanEngineService
  | LoanWriterService
  | LoanEnquiryService
  | LoanRepayerService;
const account = (id: number) => ({
  id,
  clientId: id - 10,
  accountNo: `000${id}`,
  clientName: "Invented customer",
  currency: { code: "INR", decimalPlaces: 2 },
  status: { id: 300, value: "Active", active: true },
  summary: {
    accountBalance: (id === 51 ? balance : 100000) / 100,
    availableBalance: (id === 51 ? balance : 100000) / 100,
  },
});
const post = (input: LoanRepaymentInstruction): LoanRepaymentResult => {
  const principal = input.offer.amount_minor - 10000,
    interest = 10000;
  const statement = coreLoan.statement ?? inventedLoanStatement(coreLoan);
  coreLoan = {
    ...coreLoan,
    principal_outstanding_minor:
      (coreLoan.principal_outstanding_minor ?? 0) - principal,
    outstanding_minor:
      (coreLoan.outstanding_minor ?? 0) - input.offer.amount_minor,
    statement: {
      ...statement,
      principal_paid_minor: statement.principal_paid_minor + principal,
      interest_paid_minor: statement.interest_paid_minor + interest,
      repayment_minor: statement.repayment_minor + input.offer.amount_minor,
      principal_outstanding_minor:
        statement.principal_outstanding_minor - principal,
      interest_outstanding_minor:
        statement.interest_outstanding_minor - interest,
      outstanding_minor: statement.outstanding_minor - input.offer.amount_minor,
      transactions: [
        ...statement.transactions,
        {
          id: 82,
          type_id: 2,
          date: input.offer.payment_date,
          amount_minor: input.offer.amount_minor,
          principal_minor: principal,
          interest_minor: interest,
          fees_minor: 0,
          penalties_minor: 0,
          overpayment_minor: 0,
          unrecognized_income_minor: 0,
          manually_reversed: false,
          reversed_on_date: null,
          transfer: {
            id: 92,
            amount_minor: input.offer.amount_minor,
            date: input.offer.payment_date,
            reversed: false,
            repayment_marker: loanRepaymentMarker(input.operation_id),
          },
        },
      ],
    },
  };
  balance -= input.offer.amount_minor;
  return {
    operation_id: input.operation_id,
    loan: structuredClone(coreLoan),
    loan_transaction_id: 82,
    savings_transaction_id: 102,
    transfer_id: 92,
    amount_minor: input.offer.amount_minor,
    principal_minor: principal,
    interest_minor: interest,
    date: input.offer.payment_date,
  };
};
const layer = () =>
  Layer.mergeAll(
    Layer.succeed(Store, {
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.try({
          try: () => db.query(sql).all(...values) as T[],
          catch: sqlError,
        }),
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.try({
          try: () => {
            if (
              (failReservationRead === "operation" &&
                sql.includes("FROM loan_repayment_operations") &&
                sql.includes(" AND id=?")) ||
              (failReservationRead === "claim" &&
                sql.startsWith("SELECT status,version FROM core_write_claims"))
            )
              throw new Error("Injected reservation read acknowledgement loss");
            return db.query(sql).get(...values) as T | null;
          },
          catch: sqlError,
        }),
      run: (sql: string, ...values: (string | number | null)[]) =>
        Effect.gen(function* () {
          const phase = sql.startsWith("INSERT INTO loan_repayment_operations")
            ? "reservation"
            : sql.startsWith("UPDATE loan_repayment_operations SET status")
              ? "outcome"
              : null;
          if (failStore?.phase === phase && failStore.when === "before")
            return yield* Effect.fail(sqlError());
          const changes = yield* Effect.try({
            try: () => db.run(sql, values).changes,
            catch: sqlError,
          });
          if (failStore?.phase === phase && failStore.when === "after")
            return yield* Effect.fail(sqlError());
          if (
            phase === "outcome" &&
            values[0] === "confirmed" &&
            closeRelationshipAfterConfirmation
          )
            db.run(
              "UPDATE banks SET status='closed' WHERE id='loan-test-bank'",
            );
          return changes;
        }),
    }),
    Layer.succeed(Core, {
      request: <T>(method: string, path: string) =>
        Effect.gen(function* () {
          reads.push(path);
          if (method !== "GET" || failBalance)
            return yield* Effect.fail(
              new BankingError({
                message: "Injected Core read failure",
                status: 503,
              }),
            );
          return account(Number(path.split("/")[1]?.split("?")[0])) as T;
        }),
    }),
    Layer.succeed(LoanCatalogue, {
      inventory: () =>
        Effect.sync(() => {
          reads.push("catalogue");
          return {
            cash_id: 1,
            clearing_id: 2,
            accounts: {
              OF1002: 101,
              OF1003: 102,
              OF2003: 103,
              OF4002: 104,
              OF5002: 105,
            },
            product_id: 31,
          };
        }),
      execute: () => Effect.fail(sqlError()),
    }),
    Layer.succeed(LoanEngine, {
      quote: () => Effect.succeed(workflowQuote.schedule),
    }),
    Layer.succeed(LoanWriter, {
      dispatch: (input) =>
        Effect.sync(() => {
          const result = workflowResult(input);
          coreLoan = result.loan;
          if (input.action === "disburse") {
            balance += input.quote.schedule.principal_minor;
            coreLoan = {
              ...coreLoan,
              statement: inventedLoanStatement(coreLoan),
            };
          }
          return { ...result, loan: coreLoan };
        }),
      confirm: () => Effect.fail(sqlError()),
    }),
    Layer.succeed(LoanEnquiry, {
      inspect: () => Effect.succeed(coreLoan),
      statement: () => Effect.succeed(coreLoan),
      confirmDisbursement: () => Effect.fail(sqlError()),
    }),
    Layer.succeed(LoanRepayer, {
      quote: (lookup, amount) =>
        Effect.sync(() => {
          reads.push("repayment-quote");
          return {
            offer: {
              ...lookup,
              id: crypto.randomUUID(),
              office_id: 1,
              amount_minor: amount,
              principal_outstanding_minor:
                coreLoan.principal_outstanding_minor ?? 0,
              outstanding_minor: coreLoan.outstanding_minor ?? 0,
              available_minor: balance,
              payment_date: bankingDate(time),
              quoted_at: time,
              expires_at: time + 900000,
            },
            loan: structuredClone(coreLoan),
          };
        }),
      dispatch: (input) =>
        Effect.gen(function* () {
          dispatches.push(structuredClone(input));
          expect(
            db
              .query(
                "SELECT status,command_json FROM loan_repayment_operations WHERE id=?",
              )
              .get(input.operation_id),
          ).toEqual({
            status: "executing",
            command_json: JSON.stringify(input),
          });
          expect(
            db
              .query("SELECT status FROM core_write_claims WHERE owner_id=?")
              .get(input.operation_id),
          ).toEqual({ status: "executing" });
          expect(
            db
              .query("SELECT stale FROM loan_core_views WHERE loan_id=?")
              .get(input.offer.loan_id),
          ).toEqual({ stale: 1 });
          announce?.();
          if (pause) yield* Effect.promise(() => pause ?? Promise.resolve());
          if (writerError) {
            if (commitBeforeError) post(input);
            return yield* Effect.fail(writerError);
          }
          return post(input);
        }),
      confirm: (input) =>
        Effect.gen(function* () {
          confirmations.push(structuredClone(input));
          const row = coreLoan.statement?.transactions.find(
            (t) =>
              t.transfer?.repayment_marker ===
              loanRepaymentMarker(input.operation_id),
          );
          if (!row)
            return yield* Effect.fail(
              new BankingError({
                message: "No original positive proof",
                status: 503,
                uncertain: true,
              }),
            );
          return {
            operation_id: input.operation_id,
            loan: structuredClone(coreLoan),
            loan_transaction_id: row.id,
            savings_transaction_id: 102,
            transfer_id: row.transfer?.id ?? 0,
            amount_minor: row.amount_minor,
            principal_minor: row.principal_minor,
            interest_minor: row.interest_minor,
            date: row.date,
          };
        }),
    }),
  );
const clock = () => ({
  ...Clock.make(),
  currentTimeMillis: Effect.sync(() => time),
  unsafeCurrentTimeMillis: () => time,
});
const run = <A, E>(task: Effect.Effect<A, E, Env>) =>
  Effect.runPromise(
    task.pipe(Effect.provide(layer()), Effect.withClock(clock())),
  );
const denied = <A>(task: Effect.Effect<A, BankingError, Env>) =>
  run(Effect.flip(task));
beforeEach(async () => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(ddl);
  db.run(
    "INSERT INTO banks(id,status,journey,customer_client,customer_account,recipient_client,recipient_account,employer_client,employer_account) VALUES('loan-test-bank','ready','existing',41,51,42,52,43,53),('foreign-bank','ready','existing',61,71,62,72,63,73)",
  );
  time = workflowQuotedAt;
  balance = 800000;
  reads = [];
  dispatches = [];
  confirmations = [];
  writerError = undefined;
  commitBeforeError = false;
  failBalance = false;
  failStore = undefined;
  failReservationRead = undefined;
  closeRelationshipAfterConfirmation = false;
  pause = undefined;
  announce = undefined;
  for (const step of loanSetupSteps) {
    const setup = await run(loanSetupStatus());
    await run(
      advanceLoanSetup({
        step,
        key: crypto.randomUUID(),
        version: setup.version,
      }),
    );
  }
  const quoted = await run(createLoanQuote(customer, workflowQuote.terms));
  let loan = await run(
    submitLoanApplication(
      customer,
      { quote_id: quoted.quote.id, consent: true },
      crypto.randomUUID(),
    ),
  );
  for (const action of [
    "recommend",
    "register",
    "approve",
    "disburse",
  ] as const)
    loan = await run(
      actOnLoan(
        action === "recommend" ? officer : approver,
        {
          id: loan.loan.id,
          version: loan.loan.version,
          action,
          note: "Independent invented origination",
        },
        crypto.randomUUID(),
      ),
    );
  loanId = loan.loan.id;
  reads = [];
  time += 1000;
});
afterEach(() => db.close());
const quote = () =>
  run(
    createRepaymentOffer(customer, { loan_id: loanId, amount_minor: 100000 }),
  );
const submit = async () => {
  const preview = await quote();
  return run(
    submitRepayment(
      customer,
      { offer_id: preview.offer.id, consent: true },
      crypto.randomUUID(),
      "admin-pilot",
    ),
  );
};
const act = (
  d: RepaymentDetail,
  action: RepaymentCommand["action"],
  role: Session,
  key = crypto.randomUUID(),
) =>
  run(
    actOnRepayment(
      role,
      {
        id: d.repayment.id,
        version: d.repayment.version,
        action,
        note: "Independent invented repayment review",
      },
      key,
    ),
  );
const recommended = async () => act(await submit(), "recommend", officer);

test("customer review and separate authorization reserve before one Core payment and saved reads never wake Core", async () => {
  const preview = await quote();
  expect(preview.financial_posted).toBe(false);
  expect(dispatches).toHaveLength(0);
  const submitted = await run(
    submitRepayment(
      customer,
      { offer_id: preview.offer.id, consent: true },
      "original-consent-key",
      "admin-pilot",
    ),
  );
  const review = await act(submitted, "recommend", officer);
  const paid = await act(review, "pay", approver, "original-payment-key");
  expect(paid.repayment).toMatchObject({
    status: "paid",
    maker: "officer",
    checker: "approver",
    version: 3,
    origin: "admin-pilot",
  });
  expect(paid.history).toHaveLength(4);
  expect(paid.recorded_operation?.result).toMatchObject({
    amount_minor: 100000,
    principal_minor: 90000,
    interest_minor: 10000,
  });
  expect(balance).toBe(1900000);
  expect(paid.financial_view_stale).toBe(false);
  expect(paid.core?.snapshot.statement?.repayment_minor).toBe(100000);
  const previousReads = reads.length;
  for (const role of [customer, officer, approver]) {
    expect(
      (await run(savedRepaymentDetail(role, paid.repayment.id))).repayment
        .status,
    ).toBe("paid");
    expect((await run(listRepayments(role, loanId))).repayments).toHaveLength(
      1,
    );
  }
  expect(reads).toHaveLength(previousReads);
  expect(dispatches).toHaveLength(1);
  expect(
    await run(
      verifyRepaymentPilotResponse(
        {
          kind: "action",
          role: "approver",
          key: "original-payment-key",
          command: {
            id: review.repayment.id,
            version: review.repayment.version,
            action: "pay",
            note: "Independent invented repayment review",
          },
        },
        paid,
      ),
    ),
  ).toMatchObject({ repayment: { status: "paid" } });
  expect(JSON.stringify(repaymentPilotReport(paid))).not.toContain(
    "transactions",
  );
});

test("strict roles, consent, ownership, versions and original key association fail before dispatch", async () => {
  expect(
    (
      await denied(
        createRepaymentOffer(officer, {
          loan_id: loanId,
          amount_minor: 100000,
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await denied(
        createRepaymentOffer(customer, { loan_id: loanId, amount_minor: 1.5 }),
      )
    ).status,
  ).toBe(400);
  const preview = await quote();
  expect(
    (
      await denied(
        submitRepayment(
          customer,
          { offer_id: preview.offer.id, consent: false },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await denied(
        submitRepayment(
          { ...customer, bank_id: "foreign-bank" },
          { offer_id: preview.offer.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(404);
  const d = await run(
    submitRepayment(
      customer,
      { offer_id: preview.offer.id, consent: true },
      "original-submit-key",
    ),
  );
  expect(
    (
      await denied(
        submitRepayment(
          customer,
          { offer_id: preview.offer.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await denied(
        actOnRepayment(
          approver,
          {
            id: d.repayment.id,
            version: 0,
            action: "recommend",
            note: "Wrong role review",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await denied(
        actOnRepayment(
          officer,
          {
            id: d.repayment.id,
            version: 99,
            action: "recommend",
            note: "Changed request version",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await denied(
        savedRepaymentDetail(
          { ...customer, bank_id: "foreign-bank" },
          d.repayment.id,
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    (await denied(savedRepaymentForKey(customer, "missing-original-key")))
      .uncertain,
  ).toBe(true);
  expect(dispatches).toHaveLength(0);
});

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit reservation acknowledgement sends no Core write and cannot be replayed`, async () => {
    const d = await recommended();
    failStore = { phase: "reservation", when };
    const key = crypto.randomUUID();
    const input = {
      id: d.repayment.id,
      version: d.repayment.version,
      action: "pay",
      note: "Original reviewed payment",
    };
    expect((await denied(actOnRepayment(approver, input, key))).uncertain).toBe(
      true,
    );
    expect(dispatches).toHaveLength(0);
    failStore = undefined;
    if (when === "after") {
      expect(
        (await run(actOnRepayment(approver, input, key))).operation?.status,
      ).toBe("executing");
      const unresolved = await run(inspectRepayment(approver, d.repayment.id));
      expect(unresolved.operation?.status).toBe("uncertain");
      expect(unresolved.actions).toEqual([]);
      expect(dispatches).toHaveLength(0);
    } else
      expect((await denied(savedRepaymentForKey(customer, key))).status).toBe(
        404,
      );
  });

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit outcome acknowledgement retains exactly one posting and original recovery`, async () => {
    const d = await recommended();
    failStore = { phase: "outcome", when };
    const key = crypto.randomUUID();
    expect(
      (
        await denied(
          actOnRepayment(
            approver,
            {
              id: d.repayment.id,
              version: d.repayment.version,
              action: "pay",
              note: "Original reviewed payment",
            },
            key,
          ),
        )
      ).uncertain,
    ).toBe(true);
    expect(balance).toBe(1900000);
    expect(dispatches).toHaveLength(1);
    failStore = undefined;
    let found = await run(savedRepaymentForKey(approver, key));
    if (when === "before") {
      expect(found.operation?.status).toBe("executing");
      found = await run(inspectRepayment(approver, d.repayment.id));
    }
    expect(found.repayment.status).toBe("paid");
    expect(found.recorded_operation?.status).toBe("confirmed");
    expect(dispatches).toHaveLength(1);
  });

test("a posted repayment with a lost reply remains locked through a balance refresh and confirms read-only after expiry", async () => {
  const d = await recommended();
  writerError = new BankingError({
    message: "Lost original reply",
    status: 503,
    uncertain: true,
  });
  commitBeforeError = true;
  const unknown = await act(d, "pay", approver);
  expect(unknown.operation?.status).toBe("uncertain");
  expect(balance).toBe(1900000);
  const bank = db
    .query("SELECT * FROM banks WHERE id=?")
    .get(customer.bank_id) as Bank;
  expect((await run(financialView(bank, true))).stale).toBe(true);
  expect(() =>
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('cash-race','loan-test-bank','cash-race-key','deposit','pending',10000,'Invented cash race','officer',51)",
    ),
  ).toThrow();
  writerError = undefined;
  time += 86400000;
  const confirmed = await run(inspectRepayment(approver, d.repayment.id));
  expect(confirmed.repayment.status).toBe("paid");
  expect(confirmed.financial_view_stale).toBe(false);
  expect(dispatches).toHaveLength(1);
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toEqual(dispatches[0]);
  expect(confirmed.history.map((e) => e.operation_status)).toEqual([
    null,
    null,
    "executing",
    "uncertain",
    "confirmed",
  ]);
});

test("concurrent original and competing keys cannot dispatch twice, and another role cannot cancel a reserved payment", async () => {
  const d = await recommended();
  let release: () => void = () => {};
  let began: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  announce = began;
  const key = crypto.randomUUID(),
    input = {
      id: d.repayment.id,
      version: d.repayment.version,
      action: "pay",
      note: "Original racing payment",
    };
  const payment = run(actOnRepayment(approver, input, key));
  await started;
  expect(
    (await run(actOnRepayment(approver, input, key))).operation?.status,
  ).toBe("executing");
  expect(
    (await denied(actOnRepayment(approver, input, crypto.randomUUID()))).status,
  ).toBe(409);
  const pending = await run(savedRepaymentDetail(customer, d.repayment.id));
  expect(
    (
      await denied(
        actOnRepayment(
          customer,
          {
            id: d.repayment.id,
            version: pending.repayment.version,
            action: "cancel",
            note: "Racing cancellation",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  release();
  expect((await payment).repayment.status).toBe("paid");
  expect(dispatches).toHaveLength(1);
});

test("definite failed original receipts survive a separately reviewed new attempt and expiry permits only cancellation", async () => {
  const d = await recommended();
  const key = crypto.randomUUID();
  const input = {
    id: d.repayment.id,
    version: d.repayment.version,
    action: "pay",
    note: "Original definitely rejected payment",
  };
  writerError = new BankingError({
    message: "Definite upstream rejection",
    status: 422,
    uncertain: false,
  });
  const failed = await run(actOnRepayment(approver, input, key));
  expect(failed.recorded_operation?.status).toBe("failed");
  expect(balance).toBe(2000000);
  writerError = undefined;
  const paid = await act(failed, "pay", approver);
  expect(paid.repayment.status).toBe("paid");
  const replay = await run(actOnRepayment(approver, input, key));
  expect(replay.operation?.status).toBe("confirmed");
  expect(replay.recorded_operation?.status).toBe("failed");
  expect(dispatches).toHaveLength(2);
  const fresh = await submit();
  time += 900000;
  expect(
    (
      await denied(
        actOnRepayment(
          officer,
          {
            id: fresh.repayment.id,
            version: fresh.repayment.version,
            action: "recommend",
            note: "Expired offer review",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect((await act(fresh, "cancel", customer)).repayment.status).toBe(
    "cancelled",
  );
});

test("a confirmed payment remains paid when savings refresh is unavailable and malformed pilot receipts fail closed", async () => {
  const d = await recommended();
  failBalance = true;
  const paid = await act(d, "pay", approver, "receipt-correlate-key");
  expect(paid.repayment.status).toBe("paid");
  expect(paid.financial_view_stale).toBe(true);
  expect(paid.recorded_operation?.status).toBe("confirmed");
  const command = {
    kind: "action" as const,
    role: "approver" as const,
    key: "receipt-correlate-key",
    command: {
      id: d.repayment.id,
      version: d.repayment.version,
      action: "pay" as const,
      note: "Independent invented repayment review",
    },
  };
  for (const invalid of [
    { recorded_key: "different-original-key" },
    { recorded_actor: "customer" },
    { recorded_operation: null },
    { recorded_request: { ...command.command, version: 99 } },
  ])
    expect(
      await run(
        Effect.flip(
          verifyRepaymentPilotResponse(command, { ...paid, ...invalid }),
        ),
      ),
    ).toBeInstanceOf(Error);
  expect(dispatches).toHaveLength(1);
});

for (const part of ["operation", "claim"] as const)
  test(`lost ${part} reservation read acknowledgement never dispatches an uncorroborated original`, async () => {
    const d = await recommended();
    const key = crypto.randomUUID();
    failReservationRead = part;
    expect(
      (
        await denied(
          actOnRepayment(
            approver,
            {
              id: d.repayment.id,
              version: d.repayment.version,
              action: "pay",
              note: "Original reviewed payment",
            },
            key,
          ),
        )
      ).uncertain,
    ).toBe(true);
    expect(dispatches).toHaveLength(0);
    failReservationRead = undefined;
    const found = await run(savedRepaymentForKey(approver, key));
    expect(found.operation?.status).toBe("executing");
    expect(
      (await run(inspectRepayment(approver, d.repayment.id))).operation?.status,
    ).toBe("uncertain");
    expect(dispatches).toHaveLength(0);
  });

test("ineligible loan state fails before product/Core reads and confirmed historical proof survives later relationship ineligibility", async () => {
  const q = await run(createLoanQuote(customer, workflowQuote.terms));
  const unfunded = await run(
    submitLoanApplication(
      customer,
      { quote_id: q.quote.id, consent: true },
      crypto.randomUUID(),
    ),
  );
  const oldReads = reads.length;
  expect(
    (
      await denied(
        createRepaymentOffer(customer, {
          loan_id: unfunded.loan.id,
          amount_minor: 100000,
        }),
      )
    ).status,
  ).toBe(409);
  expect(reads).toHaveLength(oldReads);
  const d = await recommended();
  writerError = new BankingError({
    message: "Lost committed reply",
    status: 503,
    uncertain: true,
  });
  commitBeforeError = true;
  const original = await act(d, "pay", approver);
  expect(original.operation?.status).toBe("uncertain");
  writerError = undefined;
  closeRelationshipAfterConfirmation = true;
  const confirmed = await run(inspectRepayment(approver, d.repayment.id));
  expect(confirmed.repayment.status).toBe("paid");
  expect(confirmed.recorded_operation?.status).toBe("confirmed");
  expect(confirmed.financial_view_stale).toBe(true);
  expect(dispatches).toHaveLength(1);
  const readCount = reads.length;
  expect(
    (await run(inspectRepayment(approver, d.repayment.id))).recorded_operation
      ?.status,
  ).toBe("confirmed");
  expect(reads).toHaveLength(readCount);
  expect(confirmations).toHaveLength(1);
});
