import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, expect } from "bun:test";
import { Clock, Effect, Layer } from "effect";
import { verifySqliteScript } from "../../../src/operations/cli/sqlite-script";
import {
  type Bank,
  BankingError,
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
  advanceLoanSetup,
  loanSetupStatus,
} from "../../../src/platform/lending/application/loan-setup";
import {
  LoanEngine,
  type LoanEngineService,
  LoanEnquiry,
  type LoanEnquiryService,
  type LoanLookup,
} from "../../../src/platform/lending/domain/origination/loan-engine";
import {
  LoanCatalogue,
  type LoanCatalogueInventory,
  type LoanCatalogueService,
} from "../../../src/platform/lending/domain/origination/loan-product";
import { loanSetupSteps } from "../../../src/platform/lending/domain/origination/loan-setup";
import type { LoanDetail } from "../../../src/platform/lending/domain/origination/loan-workflow";
import {
  type LoanWriteInstruction,
  type LoanWriteResult,
  LoanWriter,
  type LoanWriterService,
  validateLoanWriteInstruction,
} from "../../../src/platform/lending/domain/origination/loan-writing";
import type { LoanCommand } from "../../../src/platform/lending/domain/origination/loans";
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
  | LoanEnquiryService;
export function createHarness() {
  let script = "";
  beforeAll(async () => {
    const paths: string[] = [];
    for await (const file of new Bun.Glob("migrations/*.sql").scan("."))
      paths.push(file);
    script = (
      await Promise.all(paths.sort().map((file) => Bun.file(file).text()))
    ).join("\n");
    await Effect.runPromise(
      verifySqliteScript(script, [
        "loan_applications",
        "loan_operations",
        "loan_events",
      ]),
    );
  });
  const customer: Session = {
    token_hash: "invented-customer",
    bank_id: "loan-test-bank",
    role: "customer",
    expires_at: Number.MAX_SAFE_INTEGER,
  };
  const officer: Session = { ...customer, role: "officer" };
  const approver: Session = { ...customer, role: "approver" };
  let db: Database;
  let time: number;
  let catalogueReads: number;
  let calculations: number;
  let coreReads: string[];
  let dispatches: LoanWriteInstruction[];
  let confirmations: LoanWriteInstruction[];
  let balanceMinor: number;
  let nextLoan: number;
  let inventory: LoanCatalogueInventory;
  let coreState: Map<string, LoanWriteResult>;
  let writerFailure: BankingError | undefined;
  let commitBeforeFailure: boolean;
  let failCoreReads: boolean;
  let failStore:
    | { phase: "reservation" | "outcome"; when: "before" | "after" }
    | undefined;
  let beforeWrite: ((sql: string) => void) | undefined;
  let pause: Promise<void> | undefined;
  let announce: (() => void) | undefined;
  const sqlError = () =>
    new BankingError({
      message: "Injected protected persistence failure",
      status: 503,
    });
  const account = (id: number) => ({
    id,
    clientId: id - 10,
    accountNo: `000${id}`,
    clientName: "Independent invented client",
    currency: { code: "INR", decimalPlaces: 2 },
    status: { id: 300, value: "Active", active: true },
    summary: { accountBalance: id === 51 ? balanceMinor / 100 : 2000 },
  });
  const saveCore = (input: LoanWriteInstruction) => {
    const original = structuredClone(workflowResult(input));
    const result = {
      ...original,
      loan: {
        ...original.loan,
        id: input.action === "register" ? nextLoan++ : original.loan.id,
      },
    };
    if (input.action === "disburse")
      balanceMinor += input.quote.schedule.principal_minor;
    coreState.set(input.external_id, result);
    return result;
  };
  const inspectOwnedLoan = (input: LoanLookup) =>
    Effect.gen(function* () {
      coreReads.push("owned-loan-enquiry");
      if (failCoreReads)
        return yield* Effect.fail(
          new BankingError({
            message: "Loan enquiry unavailable",
            status: 503,
          }),
        );
      const result = coreState.get(input.external_id);
      if (!result)
        return yield* Effect.fail(
          new BankingError({ message: "Loan absent", status: 404 }),
        );
      return structuredClone(result.loan);
    });
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
            try: () => db.query(sql).get(...values) as T | null,
            catch: sqlError,
          }),
        run: (sql: string, ...values: (string | number | null)[]) =>
          Effect.gen(function* () {
            beforeWrite?.(sql);
            const phase = sql.startsWith("INSERT INTO loan_operations")
              ? "reservation"
              : sql.startsWith("UPDATE loan_operations SET status")
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
            return changes;
          }),
      }),
      Layer.succeed(Core, {
        request: <T>(method: string, path: string) =>
          Effect.gen(function* () {
            if (method !== "GET")
              return yield* Effect.fail(
                new BankingError({
                  message: "Unexpected raw Core mutation",
                  status: 500,
                }),
              );
            coreReads.push(path);
            if (failCoreReads)
              return yield* Effect.fail(
                new BankingError({
                  message: "Core read unavailable",
                  status: 503,
                }),
              );
            return account(Number(path.split("/")[1]?.split("?")[0])) as T;
          }),
      }),
      Layer.succeed(LoanCatalogue, {
        inventory: () =>
          Effect.sync(() => {
            catalogueReads++;
            return structuredClone(inventory);
          }),
        execute: () =>
          Effect.fail(
            new BankingError({
              message: "No reference create is expected",
              status: 500,
            }),
          ),
      }),
      Layer.succeed(LoanEngine, {
        quote: () =>
          Effect.sync(() => {
            calculations++;
            return structuredClone(workflowQuote.schedule);
          }),
      }),
      Layer.succeed(LoanWriter, {
        dispatch: (input) =>
          Effect.gen(function* () {
            dispatches.push(structuredClone(input));
            yield* validateLoanWriteInstruction(input, time, "dispatch");
            const operation = db
              .query(
                "SELECT id,status,command_json FROM loan_operations WHERE id=?",
              )
              .get(input.key.slice("of-loan-op-".length)) as {
              id: string;
              status: string;
              command_json: string;
            } | null;
            expect(operation?.status).toBe("executing");
            expect(JSON.parse(operation?.command_json ?? "null")).toEqual(
              input,
            );
            expect(
              db
                .query(
                  "SELECT status FROM core_write_claims WHERE owner_kind='loan' AND owner_id=?",
                )
                .get(operation?.id ?? ""),
            ).toEqual({ status: "executing" });
            announce?.();
            if (pause) yield* Effect.promise(() => pause ?? Promise.resolve());
            if (writerFailure) {
              if (commitBeforeFailure) saveCore(input);
              return yield* Effect.fail(writerFailure);
            }
            return saveCore(input);
          }),
        confirm: (input) =>
          Effect.gen(function* () {
            confirmations.push(structuredClone(input));
            yield* validateLoanWriteInstruction(input, time, "confirm");
            const result = coreState.get(input.external_id);
            if (
              !result ||
              result.loan.status !== workflowResult(input).loan.status ||
              (input.action === "disburse" &&
                result.loan.disbursements[0]?.external_id !==
                  input.transaction_external_id)
            )
              return yield* Effect.fail(
                new BankingError({
                  message: "Original Core result not visible",
                  status: 503,
                  uncertain: true,
                  loanProofChecks: [
                    "core-read",
                    "invented-private-diagnostic-marker",
                    "core-read",
                  ],
                }),
              );
            return structuredClone(result);
          }),
      }),
      Layer.succeed(LoanEnquiry, {
        inspect: inspectOwnedLoan,
        statement: (input) =>
          Effect.sync(() => coreReads.push("owned-loan-statement")).pipe(
            Effect.flatMap(() => inspectOwnedLoan(input)),
          ),
        confirmDisbursement: () =>
          Effect.fail(
            new BankingError({
              message: "Writer owns proof in this orchestration fixture",
              status: 500,
            }),
          ),
      }),
    );
  const clock = () => ({
    ...Clock.make(),
    currentTimeMillis: Effect.sync(() => time),
    unsafeCurrentTimeMillis: () => time,
  });
  const run = <A>(task: Effect.Effect<A, BankingError, Env>) =>
    Effect.runPromise(
      task.pipe(Effect.provide(layer()), Effect.withClock(clock())),
    );
  const denied = <A>(task: Effect.Effect<A, BankingError, Env>) =>
    Effect.runPromise(
      task.pipe(
        Effect.provide(layer()),
        Effect.withClock(clock()),
        Effect.flip,
      ),
    );
  const bank = () =>
    db.query("SELECT * FROM banks WHERE id='loan-test-bank'").get() as Bank;
  beforeEach(async () => {
    db?.close();
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    db.exec(script);
    db.run(
      "INSERT INTO banks(id,status,journey,customer_client,customer_account,recipient_client,recipient_account,employer_client,employer_account) VALUES('loan-test-bank','ready','existing',41,51,42,52,43,53),('other-bank','ready','existing',62,61,63,64,65,66)",
    );
    time = workflowQuotedAt;
    balanceMinor = 500000;
    nextLoan = 71;
    coreState = new Map();
    catalogueReads = 0;
    calculations = 0;
    coreReads = [];
    dispatches = [];
    confirmations = [];
    writerFailure = undefined;
    commitBeforeFailure = false;
    failCoreReads = false;
    failStore = undefined;
    beforeWrite = undefined;
    pause = undefined;
    announce = undefined;
    inventory = {
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
    db.run(
      "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES(?,?,?,0)",
      [
        customer.bank_id,
        JSON.stringify({
          account: account(51),
          recipient: account(52),
          employer: account(53),
        }),
        time - 1000,
      ],
    );
    for (const step of loanSetupSteps) {
      const status = await run(loanSetupStatus());
      await run(
        advanceLoanSetup({
          step,
          key: crypto.randomUUID(),
          version: status.version,
        }),
      );
    }
    catalogueReads = 0;
  });
  afterEach(() => db.close());
  const apply = async () => {
    const quoted = await run(createLoanQuote(customer, workflowQuote.terms));
    time += 1000;
    return await run(
      submitLoanApplication(
        customer,
        { quote_id: quoted.quote.id, consent: true },
        crypto.randomUUID(),
        "admin-pilot",
      ),
    );
  };
  const act = (
    detail: LoanDetail,
    action: LoanCommand["action"],
    role: Session,
    key = crypto.randomUUID(),
  ) =>
    run(
      actOnLoan(
        role,
        {
          id: detail.loan.id,
          version: detail.loan.version,
          action,
          note: "Independent invented instruction",
        },
        key,
      ),
    );
  const recommend = async () => act(await apply(), "recommend", officer);
  const approved = async () =>
    act(
      await act(await recommend(), "register", approver),
      "approve",
      approver,
    );
  return {
    get script() {
      return script;
    },
    set script(value: typeof script) {
      script = value;
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
    get catalogueReads() {
      return catalogueReads;
    },
    set catalogueReads(value: typeof catalogueReads) {
      catalogueReads = value;
    },
    get calculations() {
      return calculations;
    },
    set calculations(value: typeof calculations) {
      calculations = value;
    },
    get coreReads() {
      return coreReads;
    },
    set coreReads(value: typeof coreReads) {
      coreReads = value;
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
    get balanceMinor() {
      return balanceMinor;
    },
    set balanceMinor(value: typeof balanceMinor) {
      balanceMinor = value;
    },
    get nextLoan() {
      return nextLoan;
    },
    set nextLoan(value: typeof nextLoan) {
      nextLoan = value;
    },
    get inventory() {
      return inventory;
    },
    set inventory(value: typeof inventory) {
      inventory = value;
    },
    get coreState() {
      return coreState;
    },
    set coreState(value: typeof coreState) {
      coreState = value;
    },
    get writerFailure() {
      return writerFailure;
    },
    set writerFailure(value: typeof writerFailure) {
      writerFailure = value;
    },
    get commitBeforeFailure() {
      return commitBeforeFailure;
    },
    set commitBeforeFailure(value: typeof commitBeforeFailure) {
      commitBeforeFailure = value;
    },
    get failCoreReads() {
      return failCoreReads;
    },
    set failCoreReads(value: typeof failCoreReads) {
      failCoreReads = value;
    },
    get failStore() {
      return failStore;
    },
    set failStore(value: typeof failStore) {
      failStore = value;
    },
    get beforeWrite() {
      return beforeWrite;
    },
    set beforeWrite(value: typeof beforeWrite) {
      beforeWrite = value;
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
    get saveCore() {
      return saveCore;
    },
    get inspectOwnedLoan() {
      return inspectOwnedLoan;
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
    get bank() {
      return bank;
    },
    get apply() {
      return apply;
    },
    get act() {
      return act;
    },
    get recommend() {
      return recommend;
    },
    get approved() {
      return approved;
    },
  };
}
