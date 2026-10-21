import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { previewDemoLoan } from "../../../src/demo/scenarios/demo-loan-quote";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import {
  Store,
  type StoreService,
} from "../../../src/platform/banking-workspace/domain/ports";
import {
  advanceLoanSetup,
  inspectLoanSetup,
  loanSetupStatus,
} from "../../../src/platform/lending/application/loan-setup";
import {
  LoanEngine,
  type LoanQuoteInput,
} from "../../../src/platform/lending/domain/origination/loan-engine";
import {
  LoanCatalogue,
  type LoanCatalogueInventory,
  type LoanCatalogueService,
  type LoanSetupStep,
} from "../../../src/platform/lending/domain/origination/loan-product";
import {
  type LoanSetupCommand,
  type LoanSetupState,
  loanSetupStepId,
  loanSetupSteps,
} from "../../../src/platform/lending/domain/origination/loan-setup";

const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const harness = () => {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
  let inventory: LoanCatalogueInventory = {
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
  };
  let reads = 0;
  const creates: { step: LoanSetupStep; key: string }[] = [];
  let error: BankingError | undefined;
  let failStore: "before" | "after" | "outcome" | null = null;
  let pause: Promise<void> | null = null;
  let started: (() => void) | null = null;
  const saved = () => {
    const row = db
      .query<{ value: string }, []>(
        "SELECT value FROM settings WHERE key='loan_setup_v1'",
      )
      .get();
    return row ? (JSON.parse(row.value) as LoanSetupState) : null;
  };
  const layer = Layer.merge(
    Layer.succeed(Store, {
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).all(...values) as T[]),
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).get(...values) as T | null),
      run: (sql: string, ...values: (string | number | null)[]) =>
        Effect.gen(function* () {
          if (
            failStore === "before" ||
            (failStore === "outcome" &&
              saved()?.events.at(-1)?.status === "executing")
          )
            return yield* Effect.fail(
              new BankingError({
                message: "Injected persistence failure",
                status: 503,
              }),
            );
          const changed = db.run(sql, values).changes;
          if (failStore === "after")
            return yield* Effect.fail(
              new BankingError({
                message: "Lost persistence acknowledgement",
                status: 503,
              }),
            );
          return changed;
        }),
    }),
    Layer.succeed(LoanCatalogue, {
      inventory: () =>
        Effect.sync(() => {
          reads++;
          return structuredClone(inventory);
        }),
      execute: (step, key) =>
        Effect.gen(function* () {
          creates.push({ step, key });
          expect(saved()?.events.at(-1)).toMatchObject({
            step,
            key,
            status: "executing",
            resource_id: null,
          });
          started?.();
          if (pause) yield* Effect.promise(() => pause as Promise<void>);
          if (error) return yield* Effect.fail(error);
          const id =
            loanSetupSteps.findIndex(
              (item) => loanSetupStepId(item) === loanSetupStepId(step),
            ) + 10;
          if (step.kind === "product") inventory.product_id = id;
          else inventory.accounts = { ...inventory.accounts, [step.code]: id };
          return id;
        }),
    }),
  );
  const run = <A, E>(
    task: Effect.Effect<A, E, StoreService | LoanCatalogueService>,
  ) => Effect.runPromise(task.pipe(Effect.provide(layer)));
  const command = (
    version = 0,
    index = 0,
    key = `step-key-${index}`,
  ): LoanSetupCommand => ({ version, step: loanSetupSteps[index], key });
  return {
    db,
    creates,
    saved,
    command,
    run,
    reads: () => reads,
    setError: (value?: BankingError) => {
      error = value;
    },
    setStoreFailure: (value: typeof failStore) => {
      failStore = value;
    },
    setInventory: (value: LoanCatalogueInventory) => {
      inventory = value;
    },
    inventory: () => inventory,
    block: () => {
      let release = () => {};
      pause = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      return { release, entered };
    },
  };
};

test("saved setup status is empty without touching Core or provisioning, and all six steps retain ordered durable history", async () => {
  const h = harness();
  expect(await h.run(loanSetupStatus())).toMatchObject({
    version: 0,
    events: [],
    next: loanSetupSteps[0],
    pending: null,
  });
  expect(h.reads()).toBe(0);
  expect(h.saved()).toBeNull();
  for (let index = 0; index < 6; index++) {
    const result = await h.run(advanceLoanSetup(h.command(index * 2, index)));
    expect(result.version).toBe(index * 2 + 2);
    expect(result.events.at(-1)).toMatchObject({
      step: loanSetupSteps[index],
      status: "confirmed",
      resource_id: index + 10,
    });
  }
  expect(h.creates).toHaveLength(6);
  const status = await h.run(loanSetupStatus());
  expect(status).toMatchObject({ version: 12, next: null, pending: null });
  expect(status.events.map((event) => event.status)).toEqual(
    Array.from({ length: 6 }, () => ["executing", "confirmed"] as const).flat(),
  );
  expect(h.saved()).toEqual({ version: status.version, events: status.events });
});

test("original request replay is read-only and changed version, step, stale or out-of-order requests cannot create", async () => {
  const h = harness();
  const original = h.command();
  await h.run(advanceLoanSetup(original));
  const calls = h.reads();
  expect((await h.run(advanceLoanSetup(original))).version).toBe(2);
  expect(h.reads()).toBe(calls);
  for (const command of [
    h.command(2, 0, original.key),
    h.command(2, 1, original.key),
    h.command(0, 1, "new-key-111"),
    h.command(2, 2),
    h.command(2, 0, "new-key-222"),
  ]) {
    expect(
      (await h.run(advanceLoanSetup(command).pipe(Effect.flip))).status,
    ).toBe(409);
  }
  expect(h.creates).toHaveLength(1);
});

test("two competing creates use SQLite CAS; only the winner reaches the Core, including while its result is in flight", async () => {
  const h = harness();
  const block = h.block();
  const first = h.run(advanceLoanSetup(h.command()));
  await block.entered;
  const denied = await h.run(
    advanceLoanSetup(h.command(1, 0, "competing-key")).pipe(Effect.flip),
  );
  expect(denied.uncertain).toBe(true);
  expect(h.creates).toHaveLength(1);
  block.release();
  await first;
  const fresh = harness();
  const results = await Promise.all([
    fresh.run(advanceLoanSetup(fresh.command()).pipe(Effect.either)),
    fresh.run(
      advanceLoanSetup(fresh.command(0, 0, "competing-key")).pipe(
        Effect.either,
      ),
    ),
  ]);
  expect(results.filter((result) => result._tag === "Right")).toHaveLength(1);
  expect(fresh.creates).toHaveLength(1);
});

test("unknown outcomes never retry even when absent; read-only matching identity inspection can resolve the original key", async () => {
  const h = harness();
  h.setError(
    new BankingError({
      message: "Conflict: original command may still run",
      status: 422,
      uncertain: true,
    }),
  );
  const original = h.command();
  const result = await h.run(advanceLoanSetup(original));
  expect(result).toMatchObject({
    version: 2,
    pending: { key: original.key, status: "uncertain" },
  });
  h.setError();
  expect((await h.run(inspectLoanSetup())).pending?.status).toBe("uncertain");
  await h.run(advanceLoanSetup(original));
  expect(
    (
      await h.run(
        advanceLoanSetup(h.command(2, 0, "fresh-key-111")).pipe(Effect.flip),
      )
    ).uncertain,
  ).toBe(true);
  expect(h.creates).toHaveLength(1);
  h.setInventory({
    ...h.inventory(),
    accounts: { ...h.inventory().accounts, OF1002: 10 },
  });
  const resolved = await h.run(inspectLoanSetup());
  expect(resolved).toMatchObject({
    version: 3,
    pending: null,
    next: loanSetupSteps[1],
  });
  expect(resolved.events.map((event) => event.status)).toEqual([
    "executing",
    "uncertain",
    "confirmed",
  ]);
  expect(h.creates).toHaveLength(1);
});

test("definite failed attempts retain history and require an explicit fresh key before another create", async () => {
  const h = harness();
  h.setError(
    new BankingError({
      message: "Known validation rejection",
      status: 422,
      uncertain: false,
    }),
  );
  const result = await h.run(advanceLoanSetup(h.command()));
  expect(result).toMatchObject({
    version: 2,
    pending: null,
    next: loanSetupSteps[0],
  });
  expect(result.events.at(-1)?.status).toBe("failed");
  h.setError();
  await h.run(advanceLoanSetup(h.command()));
  expect(h.creates).toHaveLength(1);
  const completed = await h.run(
    advanceLoanSetup(h.command(2, 0, "fresh-key-111")),
  );
  expect(completed.version).toBe(4);
  expect(completed.events.map((event) => event.status)).toEqual([
    "executing",
    "failed",
    "executing",
    "confirmed",
  ]);
  expect(h.creates).toHaveLength(2);
});

test("persistence failure never authorizes a create; lost reservation/outcome acknowledgements leave inspectable original state", async () => {
  for (const failure of ["before", "after"] as const) {
    const h = harness();
    h.setStoreFailure(failure);
    expect(
      (await h.run(advanceLoanSetup(h.command()).pipe(Effect.flip))).status,
    ).toBe(503);
    expect(h.creates).toHaveLength(0);
    h.setStoreFailure(null);
    expect((await h.run(loanSetupStatus())).pending?.status ?? null).toBe(
      failure === "after" ? "executing" : null,
    );
    if (failure === "after") {
      expect((await h.run(inspectLoanSetup())).pending?.status).toBe(
        "executing",
      );
      await h.run(advanceLoanSetup(h.command()));
      expect(h.creates).toHaveLength(0);
    }
  }
  const h = harness();
  h.setStoreFailure("outcome");
  expect(
    (await h.run(advanceLoanSetup(h.command()).pipe(Effect.flip))).uncertain,
  ).toBe(true);
  expect(h.saved()?.events.at(-1)?.status).toBe("executing");
  h.setStoreFailure(null);
  expect((await h.run(inspectLoanSetup())).pending).toBeNull();
  expect(h.creates).toHaveLength(1);
});

test("already configured references are verified and checkpointed with zero creates; corrupted or exhausted histories fail closed", async () => {
  const h = harness();
  h.setInventory({
    cash_id: 1,
    clearing_id: 2,
    accounts: { OF1002: 10, OF1003: 11, OF2003: 12, OF4002: 13, OF5002: 14 },
    product_id: 15,
  });
  for (let index = 0; index < 6; index++)
    await h.run(advanceLoanSetup(h.command(index, index)));
  expect(h.creates).toEqual([]);
  expect(await h.run(loanSetupStatus())).toMatchObject({
    version: 6,
    next: null,
  });
  for (const value of [
    "not json",
    JSON.stringify({ version: 1, events: [] }),
    JSON.stringify({
      version: 1,
      events: [
        {
          step: loanSetupSteps[1],
          key: "some-key-111",
          status: "confirmed",
          resource_id: 1,
          at: 1,
          message: "Invalid ordering",
        },
      ],
    }),
  ]) {
    h.db.run("UPDATE settings SET value=?", [value]);
    expect((await h.run(loanSetupStatus().pipe(Effect.flip))).status).toBe(503);
  }
});

test("history limits preserve capacity for an uncertain result to be reconciled", async () => {
  const h = harness();
  const events = Array.from({ length: 59 }, (_, index) => [
    {
      step: loanSetupSteps[0],
      key: `failed-key-${index}`,
      status: "executing",
      resource_id: null,
      at: 1,
      message: "Reserved",
    },
    {
      step: loanSetupSteps[0],
      key: `failed-key-${index}`,
      status: "failed",
      resource_id: null,
      at: 2,
      message: "Definite rejection",
    },
  ]).flat();
  h.db.run("INSERT INTO settings(key,value) VALUES('loan_setup_v1',?)", [
    JSON.stringify({ version: 118, events }),
  ]);
  expect(
    (
      await h.run(
        advanceLoanSetup(h.command(118, 0, "fresh-final-key")).pipe(
          Effect.flip,
        ),
      )
    ).status,
  ).toBe(409);
  expect(h.creates).toEqual([]);
  expect(h.reads()).toBe(0);
  expect(h.saved()?.events).toHaveLength(118);
});

test("administrative quote preview uses only the prepared existing relationship after complete verified setup and propagates Core failure", async () => {
  const h = harness();
  const quoted: LoanQuoteInput[] = [];
  let unavailable = false;
  const engine = Layer.succeed(LoanEngine, {
    quote: (input) =>
      Effect.gen(function* () {
        quoted.push(input);
        if (unavailable)
          return yield* Effect.fail(
            new BankingError({
              message: "Core quote unavailable",
              status: 503,
            }),
          );
        return {
          currency: "INR" as const,
          principal_minor: 1200000,
          interest_minor: 120000,
          repayment_minor: 1320000,
          installments: [],
        };
      }),
  });
  const terms = {
    product: "core-personal" as const,
    principal: 12000,
    months: 12 as const,
    purpose: "education" as const,
    monthly_income: 30000,
    monthly_commitments: 5000,
    monthly_expenses: 10000,
  };
  const preview = () => previewDemoLoan(terms).pipe(Effect.provide(engine));
  expect((await h.run(preview().pipe(Effect.flip))).status).toBe(409);
  expect(quoted).toEqual([]);
  for (let index = 0; index < 6; index++)
    await h.run(advanceLoanSetup(h.command(index * 2, index)));
  expect((await h.run(preview().pipe(Effect.flip))).status).toBe(503);
  expect(quoted).toEqual([]);
  h.db.exec(
    "CREATE TABLE banks(id TEXT PRIMARY KEY,status TEXT,customer_client INTEGER,customer_account INTEGER)",
  );
  h.db.run("INSERT INTO banks VALUES('prepared-example','ready',91,92)");
  h.db.run(
    "INSERT INTO settings(key,value) VALUES('demo_existing_bank','prepared-example')",
  );
  const result = await h.run(preview());
  expect(result).toMatchObject({
    terms,
    application_created: false,
    financial_posted: false,
  });
  expect(quoted).toEqual([
    {
      owner: {
        bank_id: "prepared-example",
        product_id: 15,
        client_id: 91,
        savings_account_id: 92,
      },
      terms,
      expected_disbursement_date: result.expected_disbursement_date,
    },
  ]);
  unavailable = true;
  expect((await h.run(preview().pipe(Effect.flip))).message).toBe(
    "Core quote unavailable",
  );
  expect(h.creates).toHaveLength(6);
});

test("confirmed reference deletion or replacement blocks inspection and further setup without repairing history", async () => {
  for (const replacement of [null, 99]) {
    const h = harness();
    await h.run(advanceLoanSetup(h.command()));
    h.setInventory({
      ...h.inventory(),
      accounts: { ...h.inventory().accounts, OF1002: replacement },
    });
    expect((await h.run(inspectLoanSetup().pipe(Effect.flip))).status).toBe(
      503,
    );
    expect(
      (await h.run(advanceLoanSetup(h.command(2, 1)).pipe(Effect.flip))).status,
    ).toBe(503);
    expect(h.saved()?.version).toBe(2);
    expect(h.creates).toHaveLength(1);
  }
});
