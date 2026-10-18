import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, expect } from "bun:test";
import { Clock, Effect, Layer } from "effect";
import {
  BankingError,
  bankingDate,
  type Session,
} from "../../../src/platform/banking-workspace/domain/banking";
import {
  Core,
  type CoreService,
  Store,
  type StoreService,
} from "../../../src/platform/banking-workspace/domain/ports";
import {
  actOnLoan,
  createLoanQuote,
  submitLoanApplication,
} from "../../../src/platform/lending/application/loan-origination";
import {
  actOnRepayment,
  createRepaymentOffer,
  submitRepayment,
} from "../../../src/platform/lending/application/loan-repayment";
import {
  advanceLoanSetup,
  loanSetupStatus,
} from "../../../src/platform/lending/application/loan-setup";
import {
  type CoreLoanSnapshot,
  LoanEngine,
  type LoanEngineService,
  LoanEnquiry,
  type LoanEnquiryService,
} from "../../../src/platform/lending/domain/origination/loan-engine";
import {
  LoanCatalogue,
  type LoanCatalogueService,
} from "../../../src/platform/lending/domain/origination/loan-product";
import { loanSetupSteps } from "../../../src/platform/lending/domain/origination/loan-setup";
import {
  LoanWriter,
  type LoanWriterService,
} from "../../../src/platform/lending/domain/origination/loan-writing";
import { loanRepaymentMarker } from "../../../src/platform/lending/domain/repayments/loan-repayment-identity";
import type {
  RepaymentCommand,
  RepaymentDetail,
} from "../../../src/platform/lending/domain/repayments/loan-repayment-workflow";
import {
  LoanRepayer,
  type LoanRepayerService,
  type LoanRepaymentInstruction,
  type LoanRepaymentResult,
} from "../../../src/platform/lending/domain/repayments/loan-repayments";
import { inventedLoanStatement } from "../../fixtures/loan-statement";
import {
  workflowQuote,
  workflowQuotedAt,
  workflowResult,
} from "../../fixtures/loan-workflow";
export type Env =
  | CoreService
  | StoreService
  | LoanCatalogueService
  | LoanEngineService
  | LoanWriterService
  | LoanEnquiryService
  | LoanRepayerService;
export function createHarness() {
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
        outstanding_minor:
          statement.outstanding_minor - input.offer.amount_minor,
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
                  sql.startsWith(
                    "SELECT status,version FROM core_write_claims",
                  ))
              )
                throw new Error(
                  "Injected reservation read acknowledgement loss",
                );
              return db.query(sql).get(...values) as T | null;
            },
            catch: sqlError,
          }),
        run: (sql: string, ...values: (string | number | null)[]) =>
          Effect.gen(function* () {
            const phase = sql.startsWith(
              "INSERT INTO loan_repayment_operations",
            )
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
  return {
    get ddl() {
      return ddl;
    },
    set ddl(value: typeof ddl) {
      ddl = value;
    },
    get customer() {
      return customer;
    },
    get officer() {
      return officer;
    },
    get approver() {
      return approver;
    },
    get db() {
      return db;
    },
    set db(value: typeof db) {
      db = value;
    },
    get time() {
      return time;
    },
    set time(value: typeof time) {
      time = value;
    },
    get balance() {
      return balance;
    },
    set balance(value: typeof balance) {
      balance = value;
    },
    get loanId() {
      return loanId;
    },
    set loanId(value: typeof loanId) {
      loanId = value;
    },
    get coreLoan() {
      return coreLoan;
    },
    set coreLoan(value: typeof coreLoan) {
      coreLoan = value;
    },
    get reads() {
      return reads;
    },
    set reads(value: typeof reads) {
      reads = value;
    },
    get dispatches() {
      return dispatches;
    },
    set dispatches(value: typeof dispatches) {
      dispatches = value;
    },
    get confirmations() {
      return confirmations;
    },
    set confirmations(value: typeof confirmations) {
      confirmations = value;
    },
    get writerError() {
      return writerError;
    },
    set writerError(value: typeof writerError) {
      writerError = value;
    },
    get commitBeforeError() {
      return commitBeforeError;
    },
    set commitBeforeError(value: typeof commitBeforeError) {
      commitBeforeError = value;
    },
    get failBalance() {
      return failBalance;
    },
    set failBalance(value: typeof failBalance) {
      failBalance = value;
    },
    get failStore() {
      return failStore;
    },
    set failStore(value: typeof failStore) {
      failStore = value;
    },
    get failReservationRead() {
      return failReservationRead;
    },
    set failReservationRead(value: typeof failReservationRead) {
      failReservationRead = value;
    },
    get closeRelationshipAfterConfirmation() {
      return closeRelationshipAfterConfirmation;
    },
    set closeRelationshipAfterConfirmation(value: typeof closeRelationshipAfterConfirmation) {
      closeRelationshipAfterConfirmation = value;
    },
    get pause() {
      return pause;
    },
    set pause(value: typeof pause) {
      pause = value;
    },
    get announce() {
      return announce;
    },
    set announce(value: typeof announce) {
      announce = value;
    },
    get sqlError() {
      return sqlError;
    },
    get account() {
      return account;
    },
    get post() {
      return post;
    },
    get layer() {
      return layer;
    },
    get clock() {
      return clock;
    },
    get run() {
      return run;
    },
    get denied() {
      return denied;
    },
    get quote() {
      return quote;
    },
    get submit() {
      return submit;
    },
    get act() {
      return act;
    },
    get recommended() {
      return recommended;
    },
  };
}
