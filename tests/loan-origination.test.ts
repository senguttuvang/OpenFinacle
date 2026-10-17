import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { Clock, Effect, Layer } from "effect";
import { financialView } from "../src/application/financial-view";
import {
  actOnLoan,
  createLoanQuote,
  inspectOriginalLoan,
  refreshLoanCoreView,
  submitLoanApplication,
} from "../src/application/loan-origination";
import {
  listLoanApplications,
  savedLoanDetail,
  savedLoanForKey,
} from "../src/application/loan-records";
import {
  advanceLoanSetup,
  loanSetupStatus,
} from "../src/application/loan-setup";
import { verifySqliteScript } from "../src/cli/sqlite-script";
import { type Bank, BankingError, type Session } from "../src/domain/banking";
import {
  LoanEngine,
  type LoanEngineService,
  LoanEnquiry,
  type LoanEnquiryService,
} from "../src/domain/loan-engine";
import {
  LoanCatalogue,
  type LoanCatalogueInventory,
  type LoanCatalogueService,
} from "../src/domain/loan-product";
import { loanSetupSteps } from "../src/domain/loan-setup";
import type { LoanDetail } from "../src/domain/loan-workflow";
import {
  type LoanWriteInstruction,
  type LoanWriteResult,
  LoanWriter,
  type LoanWriterService,
  validateLoanWriteInstruction,
} from "../src/domain/loan-writing";
import type { LoanCommand } from "../src/domain/loans";
import {
  Core,
  type CoreService,
  Store,
  type StoreService,
} from "../src/domain/ports";
import {
  workflowQuote,
  workflowQuotedAt,
  workflowResult,
} from "./fixtures/loan-workflow";

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
type Env =
  | CoreService
  | StoreService
  | LoanCatalogueService
  | LoanEngineService
  | LoanWriterService
  | LoanEnquiryService;
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
          expect(JSON.parse(operation?.command_json ?? "null")).toEqual(input);
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
      inspect: (input) =>
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
        }),
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
    task.pipe(Effect.provide(layer()), Effect.withClock(clock()), Effect.flip),
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
  act(await act(await recommend(), "register", approver), "approve", approver);

test("customer acceptance and independent Core stages persist one owned loan and expose saved Core holdings without entry reads", async () => {
  const submitted = await apply();
  expect(submitted.loan).toMatchObject({
    status: "submitted",
    origin: "admin-pilot",
    version: 0,
  });
  expect(dispatches).toHaveLength(0);
  const recommended = await act(submitted, "recommend", officer);
  expect(recommended.loan.maker).toBe("officer");
  const registered = await act(recommended, "register", approver);
  expect(registered.loan).toMatchObject({
    status: "registered",
    core_id: 71,
    checker: "approver",
  });
  const sanctioned = await act(registered, "approve", approver);
  expect(sanctioned.loan.status).toBe("approved");
  const active = await act(sanctioned, "disburse", approver);
  expect(active.loan).toMatchObject({ status: "active", version: 7 });
  expect(active.core).toMatchObject({
    source: "fineract",
    snapshot: { id: 71, status: "active", principal_minor: 1200000 },
    stale: false,
  });
  expect(active.financial_view_stale).toBe(false);
  expect(balanceMinor).toBe(1700000);
  expect(active.history).toHaveLength(8);
  expect(dispatches.map((i) => i.action)).toEqual([
    "register",
    "approve",
    "disburse",
  ]);
  const oldReads = coreReads.length;
  const oldCatalogue = catalogueReads;
  const oldCalculations = calculations;
  for (const role of [customer, officer, approver]) {
    expect((await run(savedLoanDetail(role, active.loan.id))).loan.status).toBe(
      "active",
    );
    expect((await run(listLoanApplications(role))).loans).toHaveLength(1);
  }
  expect(coreReads.length).toBe(oldReads);
  expect(catalogueReads).toBe(oldCatalogue);
  expect(calculations).toBe(oldCalculations);
  time += 300001;
  expect(
    (await run(savedLoanDetail(customer, active.loan.id))).core?.stale,
  ).toBe(true);
  expect(coreReads.length).toBe(oldReads);
});

test("keys bind original actor/payload and replay saved outcomes without dispatch even after expiry", async () => {
  const recommended = await recommend();
  const key = crypto.randomUUID();
  const request = {
    id: recommended.loan.id,
    version: recommended.loan.version,
    action: "register",
    note: "Independent invented registration",
  };
  const first = await run(actOnLoan(approver, request, key));
  time += 900000;
  const replay = await run(actOnLoan(approver, request, key));
  expect(replay.loan.id).toBe(first.loan.id);
  expect(dispatches).toHaveLength(1);
  expect(
    (
      await denied(
        actOnLoan(approver, { ...request, note: "Changed original" }, key),
      )
    ).status,
  ).toBe(409);
  expect((await denied(actOnLoan(officer, request, key))).status).toBe(409);
  expect((await run(savedLoanForKey(customer, key))).recorded_actor).toBe(
    "approver",
  );
  expect(dispatches).toHaveLength(1);
});

test("quote acceptance is explicit, owned, affordable and unique, with invalid roles/fields/version rejected before Core", async () => {
  const preview = await run(createLoanQuote(customer, workflowQuote.terms));
  expect(
    (await denied(createLoanQuote(officer, workflowQuote.terms))).status,
  ).toBe(403);
  expect(
    (
      await denied(
        submitLoanApplication(
          { ...customer, bank_id: "other-bank" },
          { quote_id: preview.quote.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await denied(
        submitLoanApplication(
          customer,
          { quote_id: preview.quote.id, consent: false },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  const input = { quote_id: preview.quote.id, consent: true };
  const key = crypto.randomUUID();
  const [one, two] = await Promise.all([
    run(submitLoanApplication(customer, input, key)),
    run(submitLoanApplication(customer, input, key)),
  ]);
  expect(one.loan.id).toBe(two.loan.id);
  expect(
    (await denied(submitLoanApplication(customer, input, crypto.randomUUID())))
      .status,
  ).toBe(409);
  expect(
    (
      await denied(
        actOnLoan(
          officer,
          {
            id: one.loan.id,
            version: 99,
            action: "recommend",
            note: "Invented assessment",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await denied(
        actOnLoan(
          approver,
          {
            id: one.loan.id,
            version: 0,
            action: "recommend",
            note: "Invented assessment",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await denied(
        actOnLoan(
          officer,
          {
            id: one.loan.id,
            version: 0,
            action: "recommend",
            note: "Invented assessment",
            core_id: 71,
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  expect(dispatches).toHaveLength(0);
  expect(
    (
      await denied(
        savedLoanDetail({ ...customer, bank_id: "other-bank" }, one.loan.id),
      )
    ).status,
  ).toBe(404);
});

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit reservation acknowledgement never reaches Core and preserves any recorded original`, async () => {
    const detail = await recommend();
    failStore = { phase: "reservation", when };
    const key = crypto.randomUUID();
    const error = await denied(
      actOnLoan(
        approver,
        {
          id: detail.loan.id,
          version: detail.loan.version,
          action: "register",
          note: "Invented registration",
        },
        key,
      ),
    );
    expect(error.uncertain).toBe(true);
    expect(dispatches).toHaveLength(0);
    failStore = undefined;
    const found = await run(listLoanApplications(customer));
    expect(found.loans).toHaveLength(1);
    if (when === "after") {
      const original = await run(savedLoanForKey(approver, key));
      expect(original.operation?.status).toBe("executing");
      const inspected = await run(
        inspectOriginalLoan(approver, detail.loan.id),
      );
      expect(inspected.operation?.status).toBe("uncertain");
      expect(inspected.actions).toEqual([]);
      expect(dispatches).toHaveLength(0);
    } else
      expect((await denied(savedLoanForKey(customer, key))).status).toBe(404);
  });

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit outcome acknowledgement preserves one Core effect and recovers read-only`, async () => {
    const detail = await recommend();
    failStore = { phase: "outcome", when };
    const key = crypto.randomUUID();
    const request = {
      id: detail.loan.id,
      version: detail.loan.version,
      action: "register",
      note: "Invented registration",
    };
    expect((await denied(actOnLoan(approver, request, key))).uncertain).toBe(
      true,
    );
    expect(dispatches).toHaveLength(1);
    failStore = undefined;
    const recovered = await run(inspectOriginalLoan(approver, detail.loan.id));
    expect(recovered.loan.status).toBe("registered");
    expect((await run(actOnLoan(approver, request, key))).loan.status).toBe(
      "registered",
    );
    expect(dispatches).toHaveLength(1);
    expect(confirmations).toHaveLength(when === "before" ? 1 : 0);
  });

test("an invisible delayed disbursement remains locked across reads, then one original proof confirms posting and refreshes balances", async () => {
  const detail = await approved();
  writerFailure = new BankingError({
    message: "Original command processing",
    status: 503,
    uncertain: true,
  });
  const pending = await act(detail, "disburse", approver);
  expect(pending.operation?.status).toBe("uncertain");
  expect(pending.financial_view_stale).toBe(true);
  const original = dispatches.at(-1);
  if (!original) throw new Error("Missing original dispatch");
  const inspection = await run(inspectOriginalLoan(approver, detail.loan.id));
  expect(inspection.operation?.status).toBe("uncertain");
  expect(inspection.inspection_checks).toEqual(["core-read"]);
  expect(inspection.history).toEqual(pending.history);
  expect(inspection.financial_view_stale).toBe(true);
  expect(JSON.stringify(inspection)).not.toContain(
    "invented-private-diagnostic-marker",
  );
  expect(
    (await denied(inspectOriginalLoan(customer, detail.loan.id))).status,
  ).toBe(403);
  expect(
    (
      await denied(
        actOnLoan(
          approver,
          {
            id: detail.loan.id,
            version: pending.loan.version,
            action: "disburse",
            note: "New unsafe attempt",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  await run(financialView(bank(), true));
  expect(
    (await run(savedLoanDetail(customer, detail.loan.id))).financial_view_stale,
  ).toBe(true);
  saveCore(original);
  time += 1000;
  writerFailure = undefined;
  const confirmed = await run(inspectOriginalLoan(approver, detail.loan.id));
  expect(confirmed.loan.status).toBe("active");
  expect(confirmed.financial_view_stale).toBe(false);
  expect(balanceMinor).toBe(1700000);
  expect(dispatches.filter((i) => i.action === "disburse")).toHaveLength(1);
});

test("confirmed posting and failed balance synchronization remain separate and saved Core refresh never changes workflow", async () => {
  const detail = await approved();
  failCoreReads = true;
  const active = await act(detail, "disburse", approver);
  expect(active.loan.status).toBe("active");
  expect(active.financial_view_stale).toBe(true);
  expect(
    (await run(refreshLoanCoreView(customer, active.loan.id))).core?.stale,
  ).toBe(true);
  failCoreReads = false;
  time += 1000;
  const fresh = await run(refreshLoanCoreView(customer, active.loan.id));
  expect(fresh.loan.version).toBe(active.loan.version);
  expect(fresh.core?.stale).toBe(false);
  await run(financialView(bank(), true));
  expect(
    (await run(savedLoanDetail(customer, active.loan.id))).financial_view_stale,
  ).toBe(false);
  expect(dispatches.filter((i) => i.action === "disburse")).toHaveLength(1);
});

test("cash winning after read prevents reservation/dispatch and reservation winning blocks cancellation until original outcome", async () => {
  const detail = await recommend();
  beforeWrite = (sql) => {
    if (!sql.startsWith("INSERT INTO loan_operations")) return;
    beforeWrite = undefined;
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('cash-race','loan-test-bank','cash-original','deposit','executing',10000,'Invented','officer',51)",
    );
  };
  expect(
    (
      await denied(
        actOnLoan(
          approver,
          {
            id: detail.loan.id,
            version: detail.loan.version,
            action: "register",
            note: "Invented registration",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(dispatches).toHaveLength(0);
  db.run("UPDATE commands SET status='failed' WHERE id='cash-race'");
  let release: () => void = () => {};
  let started: () => void = () => {};
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  announce = started;
  const request = act(detail, "register", approver);
  await began;
  const pending = await run(savedLoanDetail(customer, detail.loan.id));
  expect(
    (
      await denied(
        actOnLoan(
          customer,
          {
            id: detail.loan.id,
            version: pending.loan.version,
            action: "cancel",
            note: "Racing cancellation",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  release();
  expect((await request).loan.status).toBe("registered");
  expect(dispatches).toHaveLength(1);
});

test("day rollover blocks funding while explicit customer withdrawal requires separate undo and terminal Core withdrawal", async () => {
  let detail = await approved();
  time = Date.parse("2026-10-18T09:00:00Z");
  expect(
    (
      await denied(
        actOnLoan(
          approver,
          {
            id: detail.loan.id,
            version: detail.loan.version,
            action: "disburse",
            note: "Stale funding",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  detail = await act(detail, "request_withdrawal", customer);
  expect(detail.actions).toEqual([]);
  detail = await act(detail, "undo_approval", approver);
  expect(detail.loan).toMatchObject({
    status: "registered",
    withdrawal_requested: true,
  });
  detail = await act(detail, "withdraw", approver);
  expect(detail.loan.status).toBe("withdrawn");
  expect(balanceMinor).toBe(500000);
  expect(dispatches.map((i) => i.action)).toEqual([
    "register",
    "approve",
    "undo_approval",
    "withdraw",
  ]);
});

test("an earlier definite failed reference stays failed after a fresh successful attempt, regardless of JSON field order", async () => {
  const detail = await recommend();
  const key = crypto.randomUUID();
  const request = {
    id: detail.loan.id,
    version: detail.loan.version,
    action: "register",
    note: "Original reviewed registration",
  };
  writerFailure = new BankingError({
    message: "Definite Core rejection",
    status: 422,
  });
  const failed = await run(actOnLoan(approver, request, key));
  expect(failed.recorded_operation?.status).toBe("failed");
  writerFailure = undefined;
  const success = await act(failed, "register", approver);
  expect(success.loan.status).toBe("registered");
  const original = await run(
    actOnLoan(
      approver,
      {
        note: request.note,
        action: request.action,
        version: request.version,
        id: request.id,
      },
      key,
    ),
  );
  expect(original.loan.status).toBe("registered");
  expect(original.operation?.status).toBe("confirmed");
  expect(original.recorded_operation?.status).toBe("failed");
  expect(original.recorded_operation?.key).toBe(key);
  expect(dispatches).toHaveLength(2);
  expect(coreState.size).toBe(1);
});

test("a disbursement that completed before an ambiguous reply remains locked until positive original proof", async () => {
  const detail = await approved();
  writerFailure = new BankingError({
    message: "Reply lost after original commit",
    status: 503,
    uncertain: true,
  });
  commitBeforeFailure = true;
  const pending = await act(detail, "disburse", approver);
  expect(pending.loan.status).toBe("approved");
  expect(pending.operation?.status).toBe("uncertain");
  expect(balanceMinor).toBe(1700000);
  const read = await run(financialView(bank(), true));
  expect(read.account?.summary?.accountBalance).toBe(17000);
  expect(read.stale).toBe(true);
  writerFailure = undefined;
  time += 1000;
  const confirmed = await run(inspectOriginalLoan(approver, detail.loan.id));
  expect(confirmed.loan.status).toBe("active");
  expect(confirmed.financial_view_stale).toBe(false);
  expect(balanceMinor).toBe(1700000);
  expect(dispatches.filter((i) => i.action === "disburse")).toHaveLength(1);
});

test("unaffordable or expired offers cannot be accepted or recommended and cancellation permits a fresh quote", async () => {
  const poor = await run(
    createLoanQuote(customer, {
      ...workflowQuote.terms,
      monthly_income: 5000,
      monthly_commitments: 1000,
      monthly_expenses: 3000,
    }),
  );
  expect(poor.affordability.within_declared_surplus).toBe(false);
  expect(
    (
      await denied(
        submitLoanApplication(
          customer,
          { quote_id: poor.quote.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  const submitted = await apply();
  time += 900000;
  expect(
    (
      await denied(
        actOnLoan(
          officer,
          {
            id: submitted.loan.id,
            version: submitted.loan.version,
            action: "recommend",
            note: "Expired assessment",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  const cancelled = await act(submitted, "cancel", customer);
  expect(cancelled.loan.status).toBe("cancelled");
  const fresh = await apply();
  expect(fresh.loan.status).toBe("submitted");
  expect(fresh.quote.id).not.toBe(submitted.quote.id);
  expect(dispatches).toHaveLength(0);
});

test("registered withdrawal is a separate verified instruction with no approval or funding", async () => {
  let detail = await act(await recommend(), "register", approver);
  detail = await act(detail, "request_withdrawal", customer);
  detail = await act(detail, "withdraw", approver);
  expect(detail.loan.status).toBe("withdrawn");
  expect(dispatches.map((i) => i.action)).toEqual(["register", "withdraw"]);
  expect(balanceMinor).toBe(500000);
});
