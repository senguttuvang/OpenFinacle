import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { dashboard } from "../src/application/banking";
import {
  prepareScenario,
  scenarioBank,
} from "../src/application/demo-scenarios";
import { financialView } from "../src/application/financial-view";
import { type Bank, BankingError, type Session } from "../src/domain/banking";
import {
  Core,
  type CoreService,
  Store,
  type StoreService,
} from "../src/domain/ports";

let db: Database;
let calls: { method: string; path: string }[];
let unavailable = false;
const session: Session = {
  token_hash: "demo",
  bank_id: "saved",
  role: "customer",
  expires_at: Number.MAX_SAFE_INTEGER,
};
beforeEach(async () => {
  db?.close();
  db = new Database(":memory:");
  for (const file of [
    "0001_workflows.sql",
    "0002_reversal_guard.sql",
    "0003_customer_journey.sql",
    "0004_persistent_demo.sql",
  ])
    db.exec(await Bun.file(`migrations/${file}`).text());
  db.run(
    "INSERT INTO banks(id,status,journey,customer_account,recipient_account,employer_account) VALUES('saved','ready','existing',11,22,33)",
  );
  db.run(
    "INSERT INTO settings(key,value) VALUES('demo_existing_bank','saved')",
  );
  calls = [];
  unavailable = false;
});
const layers = () =>
  Layer.merge(
    Layer.succeed(Store, {
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).all(...values) as T[]),
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).get(...values) as T | null),
      run: (sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.run(sql, values).changes),
    }),
    Layer.succeed(Core, {
      request: <T>(method: string, path: string) =>
        Effect.gen(function* () {
          calls.push({ method, path });
          if (unavailable)
            return yield* Effect.fail(
              new BankingError({ message: "Core unavailable", status: 503 }),
            );
          const id = Number(path.split("/")[1]?.split("?")[0]);
          return {
            id,
            accountNo: `000${id}`,
            clientName: "Synthetic customer",
            summary: { accountBalance: id * 100 },
            status: { active: true },
          } as T;
        }),
    }),
  );
const run = <A, E>(effect: Effect.Effect<A, E, CoreService | StoreService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layers())));
const bank = () =>
  db.query("SELECT * FROM banks WHERE id='saved'").get() as Bank;

test("prepared scenario selection and cached dashboards work without calling an unavailable core", async () => {
  await run(financialView(bank(), true));
  unavailable = true;
  calls = [];
  expect((await run(scenarioBank("existing"))).id).toBe("saved");
  const view = await run(dashboard(session, false));
  expect(view.account?.summary?.accountBalance).toBe(1100);
  expect(view.recipient.summary).toBeUndefined();
  expect(view.employer).toBeNull();
  expect(view.core).toMatchObject({
    connected: false,
    cached: true,
    stale: false,
  });
  expect(view.core.syncedAt).toBeGreaterThan(0);
  expect(calls).toEqual([]);
  expect(
    (await run(dashboard({ ...session, role: "officer" }, false))).employer
      ?.summary?.accountBalance,
  ).toBe(3300);
});

test("preparing an existing scenario never reopens or refunds financial accounts", async () => {
  await run(prepareScenario("existing"));
  await run(prepareScenario("existing"));
  expect(calls).toHaveLength(6);
  expect(calls.every((call) => call.method === "GET")).toBe(true);
  expect(db.query("SELECT COUNT(*) AS n FROM banks").get()).toEqual({ n: 1 });
});

test("missing prepared data fails explicitly without starting provisioning or fabricating balances", async () => {
  expect(await run(scenarioBank("new").pipe(Effect.flip))).toMatchObject({
    status: 503,
  });
  expect(await run(financialView(bank()).pipe(Effect.flip))).toMatchObject({
    status: 503,
  });
  expect(calls).toEqual([]);
});

test("snapshot invalidation is visible and an older refresh cannot overwrite newer state", async () => {
  await run(financialView(bank(), true));
  const future = Date.now() + 100000;
  db.run(
    "UPDATE financial_snapshots SET synced_at=?,invalidated_at=? WHERE bank_id='saved'",
    [future, future + 1],
  );
  const before = db
    .query("SELECT payload,synced_at FROM financial_snapshots")
    .get();
  expect((await run(financialView(bank()))).stale).toBe(true);
  await run(financialView(bank(), true));
  expect(
    db.query("SELECT payload,synced_at FROM financial_snapshots").get(),
  ).toEqual(before);
});

test("concurrent seeding lease rejects another operator before any financial request", async () => {
  db.run(
    "INSERT INTO demo_seed_lease(id,owner,expires_at) VALUES(1,'other',?)",
    [Date.now() + 60000],
  );
  expect(
    await run(prepareScenario("existing").pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  expect(calls).toEqual([]);
});
