import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Effect, Layer, TestClock, TestContext } from "effect";
import {
  actOnRecurringPlan,
  listRecurringPlans,
  recurringDetail,
  recurringForKey,
  submitRecurringPlan,
} from "../src/application/recurring-deposits";
import { BankingError, type Session } from "../src/domain/banking";
import { Store, type StoreService } from "../src/domain/ports";
import type {
  RecurringCommand,
  RecurringTerms,
} from "../src/domain/recurring-deposits";

let db: Database;
let now: number;
let interfere: (() => void) | undefined;
const customer: Session = {
  bank_id: "recurring-bank",
  role: "customer",
  token_hash: "synthetic",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" };
const approver: Session = { ...customer, role: "approver" };
const terms: RecurringTerms = {
  product: "demo-recurring",
  amount: 1000,
  months: 6,
  day: 15,
  label: "Example goal",
  nominee: null,
};
beforeEach(async () => {
  db?.close();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const migration of [
    "0001_workflows.sql",
    "0002_reversal_guard.sql",
    "0003_customer_journey.sql",
    "0004_persistent_demo.sql",
    "0005_service_cases.sql",
    "0006_legacy_service_guards.sql",
    "0007_cards.sql",
    "0008_profiles.sql",
    "0009_deposits.sql",
    "0010_recurring_deposits.sql",
  ])
    db.exec(await Bun.file(`migrations/${migration}`).text());
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('recurring-bank','ready',101),('unopened','ready',0),('other','ready',202)",
  );
  now = Date.parse("2026-10-17T09:00:00Z");
  interfere = undefined;
});
const failure = () =>
  new BankingError({ message: "Injected storage failure", status: 503 });
const layer = () =>
  Layer.succeed(Store, {
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).all(...values) as T[],
        catch: failure,
      }),
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).get(...values) as T | null,
        catch: failure,
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => {
          if (sql.startsWith("INSERT INTO recurring_events") && interfere) {
            const callback = interfere;
            interfere = undefined;
            callback();
          }
          return db.run(sql, values).changes;
        },
        catch: failure,
      }),
  });
const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(now);
      return yield* task;
    }).pipe(Effect.provide(layer()), Effect.provide(TestContext.TestContext)),
  );
const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
  run(task.pipe(Effect.flip));
const action = (
  id: string,
  version: number,
  value: RecurringCommand["action"],
  period?: number,
): RecurringCommand => ({
  id,
  version,
  action: value,
  note: "Synthetic reviewed instruction",
  ...(period === undefined ? {} : { period }),
});
const submit = () =>
  run(submitRecurringPlan(customer, terms, "recurring-submit-one"));
const activate = async () => {
  const { plan } = await submit();
  await run(
    actOnRecurringPlan(
      officer,
      action(plan.id, 0, "recommend"),
      "recurring-recommend",
    ),
  );
  return run(
    actOnRecurringPlan(
      approver,
      action(plan.id, 1, "activate"),
      "recurring-activate",
    ),
  );
};

test("activation persists one schedule; ordered due/missed demo allocations change progress without financial effects", async () => {
  expect((await run(listRecurringPlans(customer))).plans).toEqual([]);
  await run(listRecurringPlans(customer));
  expect(db.query("SELECT COUNT(*) AS n FROM recurring_events").get()).toEqual({
    n: 0,
  });
  const submitted = await submit();
  expect(submitted.installments).toEqual([]);
  const active = await activate();
  const id = active.plan.id;
  expect(active.plan).toMatchObject({
    status: "active",
    maker: "officer",
    checker: "approver",
    version: 2,
    maturity_date: "2027-04-17",
    maturity_minor: 610500,
    allocated_count: 0,
    allocated_minor: 0,
  });
  expect(active.installments.map((item) => item.due_date)).toEqual([
    "2026-10-17",
    "2026-11-15",
    "2026-12-15",
    "2027-01-15",
    "2027-02-15",
    "2027-03-15",
  ]);
  expect(active.installments.map((item) => item.state)).toEqual([
    "due",
    "upcoming",
    "upcoming",
    "upcoming",
    "upcoming",
    "upcoming",
  ]);
  const allocated = await run(
    actOnRecurringPlan(
      customer,
      action(id, 2, "allocate", 1),
      "recurring-allocation-one",
    ),
  );
  expect(allocated.plan).toMatchObject({
    allocated_count: 1,
    allocated_minor: 100000,
    version: 3,
  });
  expect(allocated.installments[0]).toMatchObject({
    state: "allocated",
    allocated_at: "2026-10-17T09:00:00.000Z",
  });
  expect(
    await denied(
      actOnRecurringPlan(
        customer,
        action(id, 3, "allocate", 2),
        "future-installment",
      ),
    ),
  ).toMatchObject({ status: 403 });
  now = Date.parse("2026-11-16T09:00:00Z");
  expect((await run(recurringDetail(customer, id))).installments[1].state).toBe(
    "missed",
  );
  expect(
    await denied(
      actOnRecurringPlan(
        customer,
        action(id, 3, "allocate", 3),
        "wrong-installment",
      ),
    ),
  ).toMatchObject({ status: 409 });
  const second = await run(
    actOnRecurringPlan(
      customer,
      action(id, 3, "allocate", 2),
      "recurring-allocation-two",
    ),
  );
  expect(second.plan).toMatchObject({
    allocated_count: 2,
    allocated_minor: 200000,
    version: 4,
    maturity_minor: 610500,
  });
  expect(second.history.map((event) => event.action)).toEqual([
    "submit",
    "recommend",
    "activate",
    "allocate",
    "allocate",
  ]);
  expect((await run(recurringDetail(officer, id))).plan).toEqual(second.plan);
  expect(db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
  expect(
    db
      .query("SELECT customer_account FROM banks WHERE id='recurring-bank'")
      .get(),
  ).toEqual({ customer_account: 101 });
  expect(
    db
      .query("SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'recurring.%'")
      .get(),
  ).toEqual({ n: 5 });
});
test("stable replay returns current progress once; different payload/actor and foreign ownership fail", async () => {
  const active = await activate();
  const id = active.plan.id;
  await run(
    actOnRecurringPlan(
      customer,
      action(id, 2, "allocate", 1),
      "allocation-replay-one",
    ),
  );
  const replayed = await run(
    actOnRecurringPlan(
      customer,
      action(id, 2, "allocate", 1),
      "allocation-replay-one",
    ),
  );
  expect(replayed).toMatchObject({
    confirmed_key: "allocation-replay-one",
    plan: { allocated_count: 1, version: 3 },
  });
  expect((await submit()).plan.allocated_count).toBe(1);
  expect(
    await denied(
      submitRecurringPlan(
        customer,
        { ...terms, amount: 2000 },
        "recurring-submit-one",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      actOnRecurringPlan(
        officer,
        action(id, 2, "allocate", 1),
        "allocation-replay-one",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      recurringForKey(
        { ...customer, bank_id: "other" },
        "allocation-replay-one",
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await denied(recurringDetail({ ...customer, bank_id: "other" }, id)),
  ).toMatchObject({ status: 404 });
  expect(
    await denied(
      submitRecurringPlan(
        { ...customer, bank_id: "unopened" },
        terms,
        "unopened-recurring",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(submitRecurringPlan(officer, terms, "staff-recurring-one")),
  ).toMatchObject({ status: 403 });
  expect(await denied(recurringForKey(customer, "bad"))).toMatchObject({
    status: 400,
  });
  expect(replayed.history).toHaveLength(4);
});
test("audit failure atomically rolls back activation schedule and installment/progress/key effects", async () => {
  const { plan } = await submit();
  const id = plan.id;
  await run(
    actOnRecurringPlan(
      officer,
      action(id, 0, "recommend"),
      "recurring-recommend",
    ),
  );
  db.exec(
    "CREATE TRIGGER fail_recurring_audit BEFORE INSERT ON audit WHEN NEW.action='recurring.activate' BEGIN SELECT RAISE(ABORT,'Injected failure'); END",
  );
  expect(
    await denied(
      actOnRecurringPlan(
        approver,
        action(id, 1, "activate"),
        "recurring-activate",
      ),
    ),
  ).toMatchObject({ status: 503 });
  const unactivated = await run(recurringDetail(customer, id));
  expect(unactivated.installments).toEqual([]);
  expect(unactivated.plan).toMatchObject({
    status: "recommended",
    version: 1,
    allocated_count: 0,
  });
  expect(
    await denied(recurringForKey(customer, "recurring-activate")),
  ).toMatchObject({ status: 404 });
  db.exec("DROP TRIGGER fail_recurring_audit");
  await run(
    actOnRecurringPlan(
      approver,
      action(id, 1, "activate"),
      "recurring-activate",
    ),
  );
  db.exec(
    "CREATE TRIGGER fail_allocation_audit BEFORE INSERT ON audit WHEN NEW.action='recurring.allocate' BEGIN SELECT RAISE(ABORT,'Injected failure'); END",
  );
  expect(
    await denied(
      actOnRecurringPlan(
        customer,
        action(id, 2, "allocate", 1),
        "recurring-failed-allocation",
      ),
    ),
  ).toMatchObject({ status: 503 });
  const unchanged = await run(recurringDetail(customer, id));
  expect(unchanged.plan).toMatchObject({
    version: 2,
    allocated_count: 0,
    allocated_minor: 0,
  });
  expect(unchanged.installments[0].state).toBe("due");
  expect(unchanged.history).toHaveLength(3);
  expect(
    await denied(recurringForKey(customer, "recurring-failed-allocation")),
  ).toMatchObject({ status: 404 });
  db.exec("DROP TRIGGER fail_allocation_audit");
  expect(
    (
      await run(
        actOnRecurringPlan(
          customer,
          action(id, 2, "allocate", 1),
          "recurring-failed-allocation",
        ),
      )
    ).plan.allocated_count,
  ).toBe(1);
});
test("competing allocation wins once; stale writers cannot overwrite progress or mutate schedule/history", async () => {
  const active = await activate();
  const id = active.plan.id;
  interfere = () =>
    db.run(
      "INSERT INTO recurring_events(id,bank_id,plan_id,command_key,command_payload,actor,action,note,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,period,version,created_at) SELECT 'competing',bank_id,id,'competing-allocation','{}','customer','allocate','Competing demo allocation',terms,status,maker,checker,activated_at,maturity_date,maturity_minor,1,version+1,'2026-10-17T09:00:00Z' FROM recurring_plans WHERE id=?",
      [id],
    );
  expect(
    await denied(
      actOnRecurringPlan(
        customer,
        action(id, 2, "allocate", 1),
        "racing-allocation",
      ),
    ),
  ).toMatchObject({ status: 409 });
  const current = await run(recurringDetail(customer, id));
  expect(current.plan).toMatchObject({
    version: 3,
    allocated_count: 1,
    allocated_minor: 100000,
  });
  expect(current.history).toHaveLength(4);
  expect(() =>
    db.run("UPDATE recurring_plans SET allocated_count=2 WHERE id=?", [id]),
  ).toThrow("immutable command");
  expect(() =>
    db.run(
      "UPDATE recurring_installments SET due_date='2020-01-01' WHERE plan_id=?",
      [id],
    ),
  ).toThrow("immutable allocation");
  expect(() =>
    db.run("DELETE FROM recurring_installments WHERE plan_id=?", [id]),
  ).toThrow("immutable");
  expect(() =>
    db.run("DELETE FROM recurring_events WHERE plan_id=?", [id]),
  ).toThrow("immutable");
});
