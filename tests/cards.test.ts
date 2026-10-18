import { Database } from "bun:sqlite";
import { beforeEach, expect, mock, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import type { Environment } from "../src/adapters/environment";
import {
  cardDetail,
  cardForKey,
  changeCard,
  listCards,
} from "../src/application/cards";
import { BankingError, type Session } from "../src/domain/banking";
import { CardCommand } from "../src/domain/cards";
import { Store, type StoreService } from "../src/domain/ports";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../src/http");

let db: Database;
let interfere: (() => void) | undefined;
const customer: Session = {
  bank_id: "card-bank",
  role: "customer",
  token_hash: "synthetic",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" };
const id = "demo-debit:card-bank";
const settings = {
  atm: true,
  pos: true,
  online: true,
  international: false,
  contactless: false,
  daily_limit: 50000,
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
  ])
    db.exec(await Bun.file(`migrations/${migration}`).text());
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('card-bank','ready',101),('unopened','ready',0),('other','ready',202)",
  );
  db.exec(await Bun.file("migrations/0007_cards.sql").text());
  db.exec(await Bun.file("migrations/0011_card_replacements.sql").text());
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
          if (sql.startsWith("INSERT INTO card_events") && interfere) {
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
const command = (
  action: CardCommand["action"] = "hold",
  version = 0,
): CardCommand => ({
  id,
  version,
  action,
  note: "Synthetic security control",
  ...(action === "settings" ? { settings } : {}),
});
const count = () =>
  db.query("SELECT COUNT(*) AS n FROM card_events WHERE card_id=?").get(id);

test("migration seeds opened relationships once and reads never provision", async () => {
  expect((await run(listCards(customer))).cards).toMatchObject([
    { id, suffix: "4242", version: 0, status: "active" },
  ]);
  expect(
    (await run(listCards({ ...customer, bank_id: "unopened" }))).cards,
  ).toEqual([]);
  expect(db.query("SELECT COUNT(*) AS n FROM synthetic_cards").get()).toEqual({
    n: 2,
  });
  db.run("UPDATE banks SET customer_account=303 WHERE id='unopened'");
  db.run("UPDATE banks SET customer_account=303 WHERE id='unopened'");
  expect(
    (await run(listCards({ ...customer, bank_id: "unopened" }))).cards,
  ).toHaveLength(1);
  expect(count()).toEqual({ n: 1 });
});

test("channel and limit effects persist through holds and resume without touching financial records", async () => {
  const saved = await run(
    changeCard(customer, command("settings"), "card-settings-one"),
  );
  expect(saved.card.settings).toEqual(settings);
  await run(changeCard(customer, command("hold", 1), "card-hold-one"));
  expect((await run(cardDetail(officer, id))).card).toMatchObject({
    status: "held",
    settings,
    version: 2,
  });
  await run(changeCard(customer, command("resume", 2), "card-resume-one"));
  expect((await run(cardDetail(customer, id))).card).toMatchObject({
    status: "active",
    settings,
    version: 3,
  });
  expect(
    (await run(cardDetail(officer, id))).history.map((event) => event.action),
  ).toEqual(["issued", "settings", "hold", "resume"]);
  expect(db.query("SELECT COUNT(*) AS n FROM commands").get()).toEqual({
    n: 0,
  });
  expect(
    db.query("SELECT customer_account FROM banks WHERE id='card-bank'").get(),
  ).toEqual({ customer_account: 101 });
});

test("same command replays once and reconciliation survives later changes", async () => {
  await run(changeCard(customer, command(), "card-replay-one"));
  await run(changeCard(customer, command("resume", 1), "card-replay-two"));
  const replay = await run(changeCard(customer, command(), "card-replay-one"));
  expect(replay).toMatchObject({
    confirmed_key: "card-replay-one",
    card: { version: 2, status: "active" },
  });
  expect(count()).toEqual({ n: 3 });
  expect(
    (await run(cardForKey(customer, "card-replay-one"))).confirmed_key,
  ).toBe("card-replay-one");
  expect(
    await denied(
      changeCard(
        customer,
        { ...command(), note: "Different instruction" },
        "card-replay-one",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(
      cardForKey({ ...customer, bank_id: "other" }, "card-replay-one"),
    ),
  ).toMatchObject({ status: 404 });
});

test("ownership and staff permissions are server-side and blocking is terminal", async () => {
  expect(
    await denied(cardDetail({ ...officer, bank_id: "other" }, id)),
  ).toMatchObject({ status: 404 });
  expect(
    await denied(changeCard(officer, command("settings"), "officer-settings")),
  ).toMatchObject({ status: 403 });
  expect(
    await denied(
      changeCard(
        { ...customer, role: "approver" },
        command("block"),
        "approver-block",
      ),
    ),
  ).toMatchObject({ status: 403 });
  await run(changeCard(officer, command("block"), "officer-block"));
  const blocked = await run(cardDetail(customer, id));
  expect(blocked.card.status).toBe("blocked");
  expect(blocked.actions).toEqual([]);
  expect(
    await denied(changeCard(customer, command("resume", 1), "customer-resume")),
  ).toMatchObject({ status: 403 });
  expect(() =>
    db.run(
      "UPDATE synthetic_cards SET status='active',version=version+1 WHERE id=?",
      [id],
    ),
  ).toThrow("immutable command event");
  expect(() => db.run("DELETE FROM card_events WHERE card_id=?", [id])).toThrow(
    "immutable",
  );
});

test("stale or competing edits fail without overwriting state or adding history", async () => {
  await run(changeCard(customer, command(), "card-conflict-one"));
  expect(
    await denied(changeCard(customer, command("settings"), "card-stale-one")),
  ).toMatchObject({ status: 403 });
  await run(changeCard(customer, command("resume", 1), "card-conflict-two"));
  interfere = () =>
    db.run(
      "INSERT INTO card_events(id,bank_id,card_id,command_key,command_payload,actor,action,note,status,settings,version,created_at) SELECT 'competing',bank_id,id,'competing-command','{}','officer','block','Security intervention','blocked',settings,3,'2026-10-17' FROM synthetic_cards WHERE id=?",
      [id],
    );
  expect(
    await denied(changeCard(customer, command("settings", 2), "card-race-one")),
  ).toMatchObject({ status: 409 });
  expect((await run(cardDetail(customer, id))).card).toMatchObject({
    status: "blocked",
    version: 3,
  });
  expect(count()).toEqual({ n: 4 });
});

test("history or audit failure rolls back product state and command identity together", async () => {
  db.exec(
    "CREATE TRIGGER fail_card_audit BEFORE INSERT ON audit WHEN NEW.action='card.hold' BEGIN SELECT RAISE(ABORT,'Injected failure'); END;",
  );
  expect(
    await denied(changeCard(customer, command(), "card-failure-one")),
  ).toMatchObject({ status: 503 });
  expect((await run(cardDetail(customer, id))).card).toMatchObject({
    version: 0,
    status: "active",
  });
  expect(count()).toEqual({ n: 1 });
  expect(await denied(cardForKey(customer, "card-failure-one"))).toMatchObject({
    status: 404,
  });
  db.exec("DROP TRIGGER fail_card_audit");
  await run(changeCard(customer, command(), "card-failure-one"));
  expect(count()).toEqual({ n: 2 });
});

test("schema and transitions reject invalid limits, extra fields and irrelevant settings", async () => {
  for (const daily_limit of [-1, 100001, 1.5, Number.NaN])
    expect(
      Schema.decodeUnknownEither(CardCommand)({
        ...command("settings"),
        settings: { ...settings, daily_limit },
      })._tag,
    ).toBe("Left");
  expect(
    Schema.decodeUnknownEither(CardCommand, { onExcessProperty: "error" })({
      ...command(),
      card_number: "forbidden",
    })._tag,
  ).toBe("Left");
  expect(
    await denied(
      changeCard(customer, { ...command(), settings }, "irrelevant-settings"),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await denied(
      changeCard(customer, { ...command(), note: "     " }, "empty-reason-one"),
    ),
  ).toMatchObject({ status: 400 });
  expect(await denied(changeCard(customer, command(), "bad"))).toMatchObject({
    status: 400,
  });
  expect(count()).toEqual({ n: 1 });
});

test("HTTP cards enforce session, strict fields, ownership and demo boundary without core access", async () => {
  const token = "synthetic-card-session";
  const tokenHash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,'card-bank','customer',?)",
    [tokenHash, Number.MAX_SAFE_INTEGER],
  );
  let coreCalls = 0;
  const env = {
    DB: {
      prepare: (sql: string) => {
        let values: (string | number | null)[] = [];
        return {
          bind(...args: (string | number | null)[]) {
            values = args;
            return this;
          },
          first: async () => db.query(sql).get(...values),
          all: async () => ({ results: db.query(sql).all(...values) }),
          run: async () => ({ meta: { changes: db.run(sql, values).changes } }),
        };
      },
    } as unknown as D1Database,
    CORE: {
      fetch: async () => {
        coreCalls++;
        throw new Error("No card core effects");
      },
    } as unknown as Environment["CORE"],
    DOCUMENTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "unused",
    APP_REVISION: "card-tests",
    DEMO_MODE: "true",
  } satisfies Environment;
  let httpScope = customer.bank_id;
  const http = (path: string, body?: unknown, cookie = true) =>
    handleRequest(
      new Request(`https://demo.test/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { Cookie: `of_session=${token}` } : {}),
          Origin: "https://demo.test",
          "X-Customer-Scope": httpScope,
          "Content-Type": "application/json",
          "Idempotency-Key": "http-card-command",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  expect((await http("/cards", undefined, false)).status).toBe(401);
  expect(
    (await http("/cards/action", { ...command(), status: "blocked" })).status,
  ).toBe(400);
  expect(
    (
      await http("/cards/action", {
        ...command("settings"),
        settings: { ...settings, daily_limit: 100001 },
      })
    ).status,
  ).toBe(400);
  expect((await http("/cards/action", command())).status).toBe(200);
  expect((await http("/cards?key=http-card-command")).status).toBe(200);
  db.run("UPDATE sessions SET bank_id='other' WHERE token_hash=?", [tokenHash]);
  httpScope = "other";
  expect((await http(`/cards?id=${encodeURIComponent(id)}`)).status).toBe(404);
  expect((await http("/cards?key=http-card-command")).status).toBe(404);
  const closed = await handleRequest(
    new Request("https://demo.test/api/cards"),
    { ...env, DEMO_MODE: "false" },
  );
  expect(closed.status).toBe(503);
  expect(coreCalls).toBe(0);
});
