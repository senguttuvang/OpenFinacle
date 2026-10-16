import { expect, mock, test } from "bun:test";
import type { Environment } from "../src/adapters/environment";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../src/http");

const env = (database: Partial<D1Database> = {}): Environment => ({
  DB: database as D1Database,
  DOCUMENTS: {} as R2Bucket,
  ASSETS: {} as Fetcher,
  CORE: {} as Environment["CORE"],
  CORE_DATABASE: "unused",
  CORE_PASSWORD: "unused",
  ADMIN_TOKEN: "test-admin",
  APP_REVISION: "test-revision",
});
const request = (path: string) => new Request(`https://demo.test${path}`);

test("liveness remains independent while readiness detects failed workflow storage", async () => {
  const environment = env({
    prepare: () => {
      throw new Error("private storage detail");
    },
  });
  expect(
    (await handleRequest(request("/api/health"), environment)).status,
  ).toBe(200);
  const ready = await handleRequest(request("/api/ready"), environment);
  expect(ready.status).toBe(503);
  expect(await ready.text()).not.toContain("private storage detail");
  expect(ready.headers.get("X-Request-ID")).toMatch(/^[a-f0-9-]{36}$/);
  expect(ready.headers.get("Server-Timing")).toMatch(/^app;dur=\d+$/);
});

test("controlled exception probe requires administrator authority and returns a correlation ID", async () => {
  expect(
    (
      await handleRequest(
        new Request("https://demo.test/api/admin/telemetry-probe", {
          method: "POST",
        }),
        env(),
      )
    ).status,
  ).toBe(401);
  const response = await handleRequest(
    new Request("https://demo.test/api/admin/telemetry-probe", {
      method: "POST",
      headers: { Authorization: "Bearer test-admin" },
    }),
    env(),
  );
  expect(response.status).toBe(500);
  const body = (await response.json()) as { requestId: string; error: string };
  expect(body.requestId).toBe(response.headers.get("X-Request-ID") ?? "");
  expect(body.error).not.toContain("probe");
});

test("readiness uses only the authenticated core read and never initializes a workspace", async () => {
  const statement = {
    bind() {
      return this;
    },
    first: async () => ({ ready: 1 }),
  } as unknown as D1PreparedStatement;
  const environment = env({ prepare: () => statement });
  const calls: string[] = [];
  environment.CORE = {
    fetch: async (input: Request) => {
      calls.push(`${input.method} ${new URL(input.url).pathname}`);
      expect(input.headers.get("Authorization")).toBe(
        `Basic ${btoa("mifos:unused")}`,
      );
      return Response.json({ id: 1 });
    },
  } as unknown as Environment["CORE"];
  const ready = await handleRequest(request("/api/ready"), environment);
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({
    status: "ready",
    revision: "test-revision",
  });
  expect(calls).toEqual(["GET /fineract-provider/api/v1/offices/1"]);
});

test("production mode refuses anonymous demo sessions and role switching", async () => {
  const environment = env();
  for (const path of ["/api/session", "/api/session/role"]) {
    const response = await handleRequest(
      new Request(`https://demo.test${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "approver" }),
      }),
      environment,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toContain(
      "Production customer identity is not configured",
    );
  }
});

test("journey entry only reads permanent saved data and never provisions or calls the core", async () => {
  const { Database } = await import("bun:sqlite");
  const db = new Database(":memory:");
  for (const file of [
    "0001_workflows.sql",
    "0002_reversal_guard.sql",
    "0003_customer_journey.sql",
    "0004_persistent_demo.sql",
  ])
    db.exec(await Bun.file(`migrations/${file}`).text());
  db.run(
    "INSERT INTO banks(id,status,journey,customer_account,recipient_account,employer_account) VALUES('permanent','ready','existing',11,22,33)",
  );
  db.run(
    "INSERT INTO settings(key,value) VALUES('demo_existing_bank','permanent')",
  );
  const account = {
    id: 11,
    accountNo: "00011",
    clientName: "Mira",
    summary: { accountBalance: 121300 },
    transactions: [],
  };
  db.run(
    "INSERT INTO financial_snapshots(bank_id,payload,synced_at) VALUES('permanent',?,?)",
    [
      JSON.stringify({
        account,
        recipient: { ...account, id: 22 },
        employer: { ...account, id: 33 },
      }),
      Date.now(),
    ],
  );
  const database = {
    prepare: (sql: string) => {
      let values: (string | number | null)[] = [];
      return {
        bind(...input: (string | number | null)[]) {
          values = input;
          return this;
        },
        first: async () => db.query(sql).get(...values),
        all: async () => ({ results: db.query(sql).all(...values) }),
        run: async () => ({ meta: { changes: db.run(sql, values).changes } }),
      };
    },
  } as unknown as D1Database;
  const environment = env(database);
  environment.DEMO_MODE = "true";
  let coreCalls = 0;
  environment.CORE = {
    fetch: async () => {
      coreCalls++;
      throw new Error("Unavailable core must not be called during entry");
    },
  } as unknown as Environment["CORE"];
  const response = await handleRequest(
    new Request("https://demo.test/api/session", {
      method: "POST",
      body: JSON.stringify({ journey: "existing" }),
    }),
    environment,
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    bankId: string;
    dashboard: {
      account: { summary: { accountBalance: number } };
      core: { cached: boolean };
    };
  };
  expect(result.bankId).toBe("permanent");
  expect(result.dashboard.account.summary.accountBalance).toBe(121300);
  expect(result.dashboard.core.cached).toBe(true);
  expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; Secure");
  expect(coreCalls).toBe(0);
  expect(db.query("SELECT COUNT(*) AS n FROM banks").get()).toEqual({ n: 1 });
  db.close();
});
