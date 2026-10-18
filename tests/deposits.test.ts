import { Database } from "bun:sqlite";
import { beforeEach, expect, mock, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import type { Environment } from "../src/adapters/environment";
import { depositAdvice } from "../src/application/deposit-advice";
import {
  actOnDeposit,
  depositDetail,
  depositForKey,
  listDeposits,
  submitDeposit,
} from "../src/application/deposits";
import { BankingError, type Session } from "../src/domain/banking";
import { adviceText, openingAdvice } from "../src/domain/deposit-advice";
import {
  DepositTerms,
  maturityDate,
  maturityMinor,
} from "../src/domain/deposits";
import { Store, type StoreService } from "../src/domain/ports";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../src/http");
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
test("stale/competing actions cannot overwrite decisions; history and terms resist direct mutation", async () => {
  const { deposit } = await submit();
  interfere = () =>
    db.run(
      "INSERT INTO deposit_events(id,bank_id,deposit_id,command_key,command_payload,actor,action,note,terms,status,version,created_at) VALUES('competing','deposit-bank',?,'competing-cancel','{}','customer','cancel','Customer cancelled',?,'cancelled',1,'2026-10-17')",
      [deposit.id, JSON.stringify(terms)],
    );
  expect(
    await denied(
      actOnDeposit(
        officer,
        action(deposit.id, 0, "recommend"),
        "competing-recommend",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect((await run(depositDetail(customer, deposit.id))).deposit.status).toBe(
    "cancelled",
  );
  expect(
    await denied(
      actOnDeposit(
        officer,
        action(deposit.id, 0, "recommend"),
        "stale-recommend",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(() =>
    db.run("UPDATE synthetic_deposits SET status='active' WHERE id=?", [
      deposit.id,
    ]),
  ).toThrow("immutable command");
  expect(() =>
    db.run("UPDATE synthetic_deposits SET terms='{}' WHERE id=?", [deposit.id]),
  ).toThrow("immutable command");
  expect(() =>
    db.run("DELETE FROM deposit_events WHERE deposit_id=?", [deposit.id]),
  ).toThrow("immutable");
  expect(() =>
    db.run("DELETE FROM synthetic_deposits WHERE id=?", [deposit.id]),
  ).toThrow("immutable");
});
test("product boundaries, nominee normalization, leap dates and deterministic simple-interest illustration", async () => {
  for (const input of [
    { ...terms, amount: 999 },
    { ...terms, amount: 1000001 },
    { ...terms, amount: 1000.5 },
    { ...terms, months: 7 },
    { ...terms, product: "real-core" },
    { ...terms, rate: 50 },
    { ...terms, nominee: { name: "A", relationship: "parent" } },
  ])
    expect(
      Schema.decodeUnknownEither(DepositTerms, { onExcessProperty: "error" })(
        input,
      )._tag,
    ).toBe("Left");
  expect(maturityMinor({ ...terms, months: 6 })).toBe(1030000);
  expect(maturityMinor({ ...terms, amount: 1000, months: 24 })).toBe(112000);
  expect(maturityDate("2026-08-31T09:00:00Z", 6)).toBe("2027-02-28");
  expect(maturityDate("2023-08-31T09:00:00Z", 6)).toBe("2024-02-29");
  expect(maturityDate("2026-08-31T19:00:00Z", 6)).toBe("2027-03-01");
  expect(
    await denied(
      submitDeposit(
        { ...customer, bank_id: "unopened" },
        terms,
        "unopened-deposit",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await denied(submitDeposit(officer, terms, "staff-deposit-one")),
  ).toMatchObject({ status: 403 });
  expect(await denied(submitDeposit(customer, terms, "bad"))).toMatchObject({
    status: 400,
  });
  expect(
    await denied(
      submitDeposit(
        customer,
        { ...terms, nominee: { name: "  ", relationship: "parent" } },
        "empty-nominee-one",
      ),
    ),
  ).toMatchObject({ status: 400 });
  const saved = await run(
    submitDeposit(
      customer,
      {
        ...terms,
        nominee: { name: "  Example Parent  ", relationship: "parent" },
      },
      "nominee-deposit-one",
    ),
  );
  expect(saved.deposit.terms.nominee?.name).toBe("Example Parent");
});
test("opening advice requires independent activation, remains owned and never writes on enquiry", async () => {
  const { deposit } = await submit();
  expect(
    await denied(depositAdvice(customer, "fixed", deposit.id)),
  ).toMatchObject({ status: 409 });
  await run(
    actOnDeposit(
      officer,
      action(deposit.id, 0, "recommend"),
      "advice-recommend",
    ),
  );
  await run(
    actOnDeposit(
      approver,
      action(deposit.id, 1, "activate"),
      "advice-activate",
    ),
  );
  const before = db.serialize();
  const advice = await run(depositAdvice(customer, "fixed", deposit.id));
  expect(advice).toMatchObject({
    reference: `FD-${deposit.id.slice(0, 8).toUpperCase()}`,
    amount: 10000,
    maturity_minor: 1060000,
    activation_version: 2,
  });
  expect(await run(depositAdvice(officer, "fixed", deposit.id))).toEqual(
    advice,
  );
  expect(await run(depositAdvice(approver, "fixed", deposit.id))).toEqual(
    advice,
  );
  expect(db.serialize()).toEqual(before);
  expect(
    await denied(
      depositAdvice({ ...customer, bank_id: "other" }, "fixed", deposit.id),
    ),
  ).toMatchObject({ status: 404 });
  const detail = await run(depositDetail(customer, deposit.id));
  for (const changed of [
    { ...detail, history: [] },
    { ...detail, deposit: { ...detail.deposit, maturity_minor: 123 } },
    { ...detail, deposit: { ...detail.deposit, activated_at: "invalid" } },
    { ...detail, deposit: { ...detail.deposit, checker: "officer" } },
  ])
    expect(
      await denied(openingAdvice({ kind: "fixed", detail: changed })),
    ).toMatchObject({ status: 503 });
  expect(adviceText(advice)).toContain("not an interest or tax certificate");
});

test("HTTP deposits enforce strict inputs, authentication/demo/ownership and never access financial core", async () => {
  const token = "synthetic-deposit-session";
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,'deposit-bank','customer',?)",
    [hash, Number.MAX_SAFE_INTEGER],
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
        throw new Error("No deposit core effects");
      },
    } as unknown as Environment["CORE"],
    DOCUMENTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "unused",
    APP_REVISION: "deposit-tests",
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
          "Idempotency-Key": path.endsWith("/action")
            ? "http-deposit-action"
            : "http-deposit-command",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  expect((await http("/deposits", undefined, false)).status).toBe(401);
  expect((await http("/deposits", { ...terms, rate: 20 })).status).toBe(400);
  const response = await http("/deposits", terms);
  expect(response.status).toBe(200);
  const saved = (await response.json()) as { deposit: { id: string } };
  const advicePath = `/deposit-advice?kind=fixed&id=${saved.deposit.id}`;
  expect((await http(advicePath, undefined, false)).status).toBe(401);
  expect((await http(advicePath)).status).toBe(409);
  expect((await http(`${advicePath}&id=other`)).status).toBe(400);
  expect((await http(`${advicePath}&rate=99`)).status).toBe(400);
  expect((await http(`${advicePath}&download=html`)).status).toBe(400);
  expect((await http("/deposit-advice?kind=unknown&id=example")).status).toBe(
    400,
  );
  await run(
    actOnDeposit(
      officer,
      action(saved.deposit.id, 0, "recommend"),
      "http-advice-recommend",
    ),
  );
  await run(
    actOnDeposit(
      approver,
      action(saved.deposit.id, 1, "activate"),
      "http-advice-activate",
    ),
  );
  const download = await http(`${advicePath}&download=1`);
  expect(download.status).toBe(200);
  expect(download.headers.get("content-type")).toBe(
    "text/plain; charset=utf-8",
  );
  expect(download.headers.get("content-disposition")).toMatch(
    /^attachment; filename="openfinacle-demo-FD-[A-Z0-9-]{8}\.txt"$/,
  );
  expect(download.headers.get("cache-control")).toBe("no-store");
  expect(download.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await download.text()).toContain(
    "Illustrated maturity amount: ₹10,600.00",
  );
  expect(
    (await http("/deposits/action", action(saved.deposit.id, 2, "activate")))
      .status,
  ).toBe(403);
  db.run("UPDATE sessions SET bank_id='other' WHERE token_hash=?", [hash]);
  httpScope = "other";
  expect((await http(advicePath)).status).toBe(404);
  expect((await http(`/deposits?id=${saved.deposit.id}`)).status).toBe(404);
  expect((await http("/deposits?key=http-deposit-command")).status).toBe(404);
  expect(
    (
      await handleRequest(new Request("https://demo.test/api/deposits"), {
        ...env,
        DEMO_MODE: "false",
      })
    ).status,
  ).toBe(503);
  expect(coreCalls).toBe(0);
});
