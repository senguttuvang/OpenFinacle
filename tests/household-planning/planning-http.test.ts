import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import type { Environment } from "../../src/runtime/http/environment";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../../src/runtime/http/http");
let ddl = "";
let db: Database;
let env: Environment;
let coreCalls = 0;
const token = "independently-invented-planning-http-session";
const tokenHash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
const relationship = "planning-portal-owner";
const query = `?household=synthetic-nila&relationship=${relationship}`;
beforeAll(async () => {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(path);
  ddl = (
    await Promise.all(paths.sort().map((path) => Bun.file(path).text()))
  ).join("\n");
});
beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(ddl);
  db.run(
    "INSERT INTO banks(id,status,journey) VALUES(?,'ready','existing'),('another-planning-owner','ready','existing')",
    [relationship],
  );
  db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,?,'customer',?)",
    [tokenHash, relationship, Number.MAX_SAFE_INTEGER],
  );
  coreCalls = 0;
  env = {
    DB: {
      prepare: (sql: string) => {
        let values: (string | number | null)[] = [];
        return {
          bind(...parameters: (string | number | null)[]) {
            values = parameters;
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
        throw new Error("Planning must never access the banking core");
      },
    } as unknown as Environment["CORE"],
    ASSETS: {} as Fetcher,
    DOCUMENTS: {} as R2Bucket,
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "invented-only",
    APP_REVISION: "planning-http-test",
    DEMO_MODE: "true",
  };
});
afterEach(() => {
  expect(coreCalls).toBe(0);
  db.close();
});
const http = (
  path: string,
  body?: unknown,
  key = "planning-http-original-key",
  authenticated = true,
) =>
  handleRequest(
    new Request(`https://synthetic.invalid/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(authenticated ? { Cookie: `of_session=${token}` } : {}),
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );

test("production planning namespace requires a current session, explicit demo mode and matching relationship", async () => {
  expect(
    (await http("/planning/context", undefined, undefined, false)).status,
  ).toBe(401);
  db.run("UPDATE sessions SET expires_at=0");
  expect((await http("/planning/context")).status).toBe(401);
  db.run("UPDATE sessions SET expires_at=?", [Number.MAX_SAFE_INTEGER]);
  env.DEMO_MODE = "false";
  expect((await http("/planning/context")).status).toBe(503);
  env.DEMO_MODE = "true";
  expect(await (await http("/planning/context")).json()).toEqual({
    relationship,
    role: "customer",
    readOnly: false,
  });
  expect(
    (
      await http(
        "/planning?household=synthetic-nila&relationship=another-planning-owner",
      )
    ).status,
  ).toBe(409);
  expect((await http("/planning-other")).status).toBe(404);
  expect(db.query("SELECT COUNT(*) AS n FROM planning_events").get()).toEqual({
    n: 0,
  });
});

test("real authenticated router saves once, isolates relationships, and scopes officer consent without financial writes", async () => {
  const initialized = await http(
    `/planning/initialize${query}`,
    {},
    "planning-http-initialize",
  );
  expect(initialized.status).toBe(200);
  const { state } = (await initialized.json()) as {
    state: import("../../src/platform/household-planning/domain/planning-state").PlanningState;
  };
  const input = { ...state, budgets: { Dining: 12300 }, adviserConsent: true };
  expect((await http(`/planning${query}`, input)).status).toBe(200);
  expect((await http(`/planning${query}`, input)).status).toBe(200);
  const replay = (await (
    await http(`/planning/command${query}&key=planning-http-original-key`)
  ).json()) as { state: typeof state; confirmedKey: string };
  expect(replay.state.version).toBe(1);
  expect(replay.state.budgets.Dining).toBe(12300);
  expect(replay.confirmedKey).toBe("planning-http-original-key");
  expect(
    (await http(`/planning${query}`, input, "different-stale-command")).status,
  ).toBe(409);
  expect((await http("/session/role", { role: "officer" })).status).toBe(200);
  const review = (await (await http(`/planning${query}`)).json()) as {
    readOnly: boolean;
    state: typeof state;
  };
  expect(review.readOnly).toBe(true);
  expect(review.state.budgets.Dining).toBe(12300);
  expect(
    (await http(`/planning${query}`, review.state, "officer-cannot-save"))
      .status,
  ).toBe(403);
  expect((await http("/session/role", { role: "customer" })).status).toBe(200);
  expect(
    (
      await http(
        `/planning${query}`,
        { ...review.state, adviserConsent: false },
        "revoke-http-consent",
      )
    ).status,
  ).toBe(200);
  expect((await http("/session/role", { role: "officer" })).status).toBe(200);
  expect((await http(`/planning${query}`)).status).toBe(403);
  expect((await http("/session/role", { role: "approver" })).status).toBe(200);
  expect((await http("/planning/context")).status).toBe(403);
  db.run(
    "UPDATE sessions SET bank_id='another-planning-owner',role='customer'",
  );
  expect(
    (
      await http(
        "/planning?household=synthetic-nila&relationship=another-planning-owner",
      )
    ).status,
  ).toBe(404);
  expect((await http(`/planning${query}`)).status).toBe(409);
  expect(db.query("SELECT COUNT(*) AS n FROM planning_events").get()).toEqual({
    n: 3,
  });
  for (const table of [
    "commands",
    "loan_operations",
    "loan_repayment_operations",
    "card_events",
    "deposit_events",
  ]) {
    expect(db.query(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({
      n: 0,
    });
  }
});
