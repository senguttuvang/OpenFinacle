import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  actOnDeposit,
  depositDetail,
  depositForKey,
  listDeposits,
  submitDeposit,
} from "../src/application/deposits";
import { BankingError, type Session } from "../src/domain/banking";
import {
  type DepositTerms,
  maturityDate,
  maturityMinor,
} from "../src/domain/deposits";
import { Store, type StoreService } from "../src/domain/ports";

let db: Database;
let interfere: (() => void) | undefined;
const customer: Session = {
  bank_id: "deposit-bank",
  role: "customer",
  token_hash: "synthetic",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" };
const approver: Session = { ...customer, role: "approver" };
const terms: DepositTerms = {
  product: "demo-cumulative",
  amount: 10000,
  months: 12,
  maturity: "return_all",
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
  ])
    db.exec(await Bun.file(`migrations/${migration}`).text());
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('deposit-bank','ready',101),('unopened','ready',0),('other','ready',202)",
  );
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
          if (sql.startsWith("INSERT INTO deposit_events") && interfere) {
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
  Effect.runPromise(task.pipe(Effect.provide(layer())));
const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
  run(task.pipe(Effect.flip));
const submit = () => run(submitDeposit(customer, terms, "deposit-submit-one"));
const action = (
  id: string,
  version: number,
  command: "recommend" | "activate" | "reject" | "cancel",
) => ({ id, version, action: command, note: "Synthetic reviewed instruction" });

test("deposit creates persistent product application; independent activation creates holding without financial effects", async () => {
  expect(maturityMinor(terms)).toBe(1060000);
  expect((await run(listDeposits(customer))).deposits).toEqual([]);
  const first = await submit();
  const id = first.deposit.id;
  expect(first).toMatchObject({
    deposit: { status: "submitted", version: 0, maturity_minor: null },
    confirmed_key: "deposit-submit-one",
    actions: ["cancel"],
  });
  expect(
    await denied(
      actOnDeposit(officer, action(id, 0, "activate"), "officer-activate"),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await denied(
      actOnDeposit(approver, action(id, 0, "activate"), "early-activate"),
    ),
  ).toMatchObject({ status: 403 });
  await run(
    actOnDeposit(officer, action(id, 0, "recommend"), "deposit-recommend"),
  );
  expect(
    await denied(
      actOnDeposit(officer, action(id, 1, "activate"), "self-activate-one"),
    ),
  ).toMatchObject({ status: 403 });
  const final = await run(
    actOnDeposit(approver, action(id, 1, "activate"), "deposit-activate"),
  );
  expect(final.deposit).toMatchObject({
    status: "active",
    version: 2,
    maker: "officer",
    checker: "approver",
    maturity_minor: 1060000,
  });
  expect(final.deposit.maturity_date).toBe(
    maturityDate(final.deposit.activated_at ?? "", 12),
  );
  expect(
    (await run(depositDetail(customer, id))).history.map(
      (event) => event.action,
    ),
  ).toEqual(["submit", "recommend", "activate"]);
  expect((await run(listDeposits(officer))).deposits).toEqual([final.deposit]);
  expect(db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
  expect(
    db
      .query("SELECT customer_account FROM banks WHERE id='deposit-bank'")
      .get(),
  ).toEqual({ customer_account: 101 });
  expect(
    db
      .query("SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'deposit.%'")
      .get(),
  ).toEqual({ n: 3 });
});
test("same command replay confirms original key and current holding; conflicts and foreign ownership fail", async () => {
  const { deposit } = await submit();
  await run(
    actOnDeposit(
      officer,
      action(deposit.id, 0, "recommend"),
      "recommend-replay",
    ),
  );
  expect((await submit()).deposit.status).toBe("recommended");
  expect(
    (await run(depositForKey(customer, "deposit-submit-one"))).confirmed_key,
  ).toBe("deposit-submit-one");
  expect(
    await denied(
      submitDeposit(
        customer,
        { ...terms, amount: 20000 },
        "deposit-submit-one",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      actOnDeposit(
        approver,
        action(deposit.id, 0, "recommend"),
        "recommend-replay",
      ),
    ),
  ).toMatchObject({ status: 409 });
  for (const task of [
    depositDetail({ ...customer, bank_id: "other" }, deposit.id),
    depositForKey({ ...customer, bank_id: "other" }, "deposit-submit-one"),
  ])
    expect(await denied(task)).toMatchObject({ status: 404 });
  expect(
    (await run(listDeposits({ ...customer, bank_id: "other" }))).deposits,
  ).toEqual([]);
  expect(db.query("SELECT COUNT(*) AS n FROM deposit_events").get()).toEqual({
    n: 2,
  });
});
test("cancel/reject are terminal and recommendations prevent customer cancellation", async () => {
  const { deposit } = await submit();
  await run(
    actOnDeposit(
      customer,
      action(deposit.id, 0, "cancel"),
      "cancel-deposit-one",
    ),
  );
  expect((await run(depositDetail(customer, deposit.id))).actions).toEqual([]);
  expect(
    await denied(
      actOnDeposit(
        officer,
        action(deposit.id, 1, "recommend"),
        "closed-recommend",
      ),
    ),
  ).toMatchObject({ status: 403 });
  const second = await run(
    submitDeposit(customer, terms, "deposit-submit-two"),
  );
  await run(
    actOnDeposit(
      officer,
      action(second.deposit.id, 0, "recommend"),
      "recommend-second",
    ),
  );
  expect(
    await denied(
      actOnDeposit(
        customer,
        action(second.deposit.id, 1, "cancel"),
        "late-cancel-one",
      ),
    ),
  ).toMatchObject({ status: 403 });
  await run(
    actOnDeposit(
      approver,
      action(second.deposit.id, 1, "reject"),
      "reject-second-one",
    ),
  );
  expect(
    (await run(depositDetail(officer, second.deposit.id))).actions,
  ).toEqual([]);
});
test("audit failure rolls back submission/activation and preserves retry identity", async () => {
  db.exec(
    "CREATE TRIGGER fail_deposit_audit BEFORE INSERT ON audit WHEN NEW.action LIKE 'deposit.%' BEGIN SELECT RAISE(ABORT,'Injected failure'); END",
  );
  expect(
    await denied(submitDeposit(customer, terms, "deposit-submit-one")),
  ).toMatchObject({ status: 503 });
  expect((await run(listDeposits(customer))).deposits).toEqual([]);
  expect(
    await denied(depositForKey(customer, "deposit-submit-one")),
  ).toMatchObject({ status: 404 });
  db.exec("DROP TRIGGER fail_deposit_audit");
  const { deposit } = await submit();
  await run(
    actOnDeposit(
      officer,
      action(deposit.id, 0, "recommend"),
      "recommend-failure",
    ),
  );
  db.exec(
    "CREATE TRIGGER fail_activation BEFORE INSERT ON audit WHEN NEW.action='deposit.activate' BEGIN SELECT RAISE(ABORT,'Injected failure'); END",
  );
  expect(
    await denied(
      actOnDeposit(
        approver,
        action(deposit.id, 1, "activate"),
        "activate-failure",
      ),
    ),
  ).toMatchObject({ status: 503 });
  expect(
    (await run(depositDetail(customer, deposit.id))).deposit,
  ).toMatchObject({ status: "recommended", version: 1, activated_at: null });
  expect(
    await denied(depositForKey(customer, "activate-failure")),
  ).toMatchObject({ status: 404 });
});
