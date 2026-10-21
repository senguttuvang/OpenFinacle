import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  BankingError,
  type Session,
} from "../../src/platform/banking-workspace/domain/banking";
import {
  Store,
  type StoreService,
} from "../../src/platform/banking-workspace/domain/ports";
import {
  initializePlanning,
  inspectPlanningCommand,
  readPlanning,
  savePlanning,
} from "../../src/platform/household-planning/application/planning";
import { planningRequest } from "../../src/runtime/http/planning-http";

let db: Database;
let interfere: (() => void) | undefined;
const customer: Session = {
  bank_id: "planning-owner",
  role: "customer",
  token_hash: "synthetic",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const household = "synthetic-nila";
beforeEach(async () => {
  db?.close();
  db = new Database(":memory:");
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE banks(id TEXT PRIMARY KEY); INSERT INTO banks(id) VALUES('planning-owner'),('other-owner');",
  );
  db.exec(await Bun.file("migrations/0015_planning.sql").text());
  interfere = undefined;
});
const layer = () =>
  Layer.succeed(Store, {
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).get(...values) as T | null,
        catch: () =>
          new BankingError({ message: "Storage failure", status: 503 }),
      }),
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).all(...values) as T[],
        catch: () =>
          new BankingError({ message: "Storage failure", status: 503 }),
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => {
          if (interfere && sql.startsWith("INSERT INTO planning_events")) {
            const callback = interfere;
            interfere = undefined;
            callback();
          }
          return db.run(sql, values).changes;
        },
        catch: () =>
          new BankingError({ message: "Storage failure", status: 503 }),
      }),
  });
const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
  Effect.runPromise(task.pipe(Effect.provide(layer())));
const outcome = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
  run(Effect.either(task));
test("deliberate setup, save/reload, audit and exact command replay persist without reseeding", async () => {
  expect((await outcome(readPlanning(customer, household)))._tag).toBe("Left");
  const initial = await run(
    initializePlanning(customer, household, "initialize-planning-one"),
  );
  const saved = await run(
    savePlanning(
      customer,
      household,
      { ...initial, budgets: { Dining: 125000 } },
      "planning-save-one",
    ),
  );
  expect(saved.version).toBe(1);
  const confirmation = await run(
    inspectPlanningCommand(customer, household, "planning-save-one"),
  );
  expect(confirmation.confirmedKey).toBe("planning-save-one");
  expect(confirmation.state).toEqual(saved);
  expect(
    (
      await outcome(
        inspectPlanningCommand(
          customer,
          "synthetic-kaveri",
          "planning-save-one",
        ),
      )
    )._tag,
  ).toBe("Left");
  expect(
    (await run(readPlanning(customer, household))).state.budgets.Dining,
  ).toBe(125000);
  expect(
    await run(
      savePlanning(
        customer,
        household,
        { ...initial, budgets: { Dining: 125000 } },
        "planning-save-one",
      ),
    ),
  ).toEqual(saved);
  expect((await run(readPlanning(customer, household))).history).toHaveLength(
    2,
  );
  expect(
    (
      await outcome(
        savePlanning(
          customer,
          household,
          { ...initial, budgets: {} },
          "planning-save-one",
        ),
      )
    )._tag,
  ).toBe("Left");
  expect(
    (await outcome(initializePlanning(customer, household, "initialize-again")))
      ._tag,
  ).toBe("Left");
  expect(() => db.run("UPDATE planning_events SET actor='customer'")).toThrow(
    "immutable",
  );
  expect(() => db.run("DELETE FROM planning_events")).toThrow("immutable");
});
test("relationship isolation and explicit household consent gate officer review; approver has no access", async () => {
  const initial = await run(
    initializePlanning(customer, household, "initialize-planning-one"),
  );
  const officer = { ...customer, role: "officer" as const };
  expect((await outcome(readPlanning(officer, household)))._tag).toBe("Left");
  expect(
    (
      await outcome(
        readPlanning({ ...customer, bank_id: "other-owner" }, household),
      )
    )._tag,
  ).toBe("Left");
  const shared = await run(
    savePlanning(
      customer,
      household,
      { ...initial, adviserConsent: true },
      "grant-review-consent",
    ),
  );
  expect((await run(readPlanning(officer, household))).readOnly).toBe(true);
  expect(
    (
      await outcome(
        savePlanning(officer, household, shared, "officer-write-denied"),
      )
    )._tag,
  ).toBe("Left");
  expect(
    (await outcome(readPlanning({ ...customer, role: "approver" }, household)))
      ._tag,
  ).toBe("Left");
  await run(
    savePlanning(
      customer,
      household,
      { ...shared, adviserConsent: false },
      "revoke-review-consent",
    ),
  );
  expect((await outcome(readPlanning(officer, household)))._tag).toBe("Left");
});
test("stale saves and racing writes cannot overwrite a newer version", async () => {
  const initial = await run(
    initializePlanning(customer, household, "initialize-planning-one"),
  );
  await run(savePlanning(customer, household, initial, "planning-first-save"));
  expect(
    (
      await outcome(
        savePlanning(customer, household, initial, "planning-stale-save"),
      )
    )._tag,
  ).toBe("Left");
  const current = (await run(readPlanning(customer, household))).state;
  interfere = () =>
    db.run(
      "UPDATE planning_households SET version=version+1 WHERE bank_id=? AND household_id=?",
      [customer.bank_id, household],
    );
  expect(
    (
      await outcome(
        savePlanning(customer, household, current, "planning-racing-save"),
      )
    )._tag,
  ).toBe("Left");
  expect(db.query("SELECT COUNT(*) AS n FROM planning_events").get()).toEqual({
    n: 2,
  });
});
test("HTTP planning adapter preserves role and ownership boundary", async () => {
  const setup = await run(
    planningRequest(
      new Request(
        `https://synthetic.invalid/api/planning/initialize?household=${household}&relationship=${customer.bank_id}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": "planning-http-init" },
        },
      ),
      customer,
      "true",
    ),
  );
  expect(setup.status).toBe(200);
  const get = await run(
    planningRequest(
      new Request(
        `https://synthetic.invalid/api/planning?household=${household}&relationship=${customer.bank_id}`,
      ),
      customer,
      "true",
    ),
  );
  expect(
    ((await get.json()) as { state: { version: number } }).state.version,
  ).toBe(0);
  expect(
    (
      await outcome(
        planningRequest(
          new Request(
            `https://synthetic.invalid/api/planning?household=${household}&relationship=${customer.bank_id}`,
          ),
          { ...customer, role: "officer" },
          "true",
        ),
      )
    )._tag,
  ).toBe("Left");
  const disabled = await run(
    planningRequest(
      new Request(
        `https://synthetic.invalid/api/planning?household=${household}&relationship=${customer.bank_id}`,
      ),
      customer,
      "false",
    ).pipe(Effect.flip),
  );
  expect(disabled.status).toBe(403);
});

test("audit application failure rolls back setup and permits the same unrecorded reference", async () => {
  db.exec(
    "CREATE TRIGGER planning_injected_failure BEFORE INSERT ON planning_households BEGIN SELECT RAISE(ABORT,'Injected planning write failure'); END",
  );
  expect(
    (
      await outcome(
        initializePlanning(customer, household, "planning-atomic-setup"),
      )
    )._tag,
  ).toBe("Left");
  expect(db.query("SELECT COUNT(*) AS n FROM planning_events").get()).toEqual({
    n: 0,
  });
  expect(
    db.query("SELECT COUNT(*) AS n FROM planning_households").get(),
  ).toEqual({ n: 0 });
  db.exec("DROP TRIGGER planning_injected_failure");
  expect(
    (
      await run(
        initializePlanning(customer, household, "planning-atomic-setup"),
      )
    ).version,
  ).toBe(0);
});
test("unsupported saved snapshots fail visibly and are preserved rather than reseeded", async () => {
  const initial = await run(
    initializePlanning(customer, household, "planning-future-data"),
  );
  const original = JSON.stringify({
    ...initial,
    unsupportedFutureField: "preserve this record",
  });
  db.run(
    "UPDATE planning_households SET state=? WHERE bank_id=? AND household_id=?",
    [original, customer.bank_id, household],
  );
  const failed = await run(readPlanning(customer, household).pipe(Effect.flip));
  expect(failed.status).toBe(503);
  expect(
    db
      .query(
        "SELECT state FROM planning_households WHERE bank_id=? AND household_id=?",
      )
      .get(customer.bank_id, household),
  ).toEqual({ state: original });
  expect(
    (await outcome(initializePlanning(customer, household, "no-silent-reseed")))
      ._tag,
  ).toBe("Left");
});
