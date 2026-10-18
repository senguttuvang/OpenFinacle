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

test("service catalogue requires identity and returns only static contracts without core access", async () => {
  const environment = env();
  environment.DEMO_MODE = "true";
  expect(
    (await handleRequest(request("/api/service-catalog"), environment)).status,
  ).toBe(401);
  const reads: string[] = [];
  let coreCalls = 0;
  environment.CORE = {
    fetch: async () => {
      coreCalls++;
      throw new Error("Catalogue must not call the banking core");
    },
  } as unknown as Environment["CORE"];
  const statement = {
    bind() {
      return this;
    },
    first: async () => ({
      token_hash: "synthetic",
      bank_id: "synthetic-bank",
      role: "customer",
      expires_at: Number.MAX_SAFE_INTEGER,
    }),
  } as unknown as D1PreparedStatement;
  environment.DB = {
    prepare: (sql: string) => {
      reads.push(sql);
      return statement;
    },
  } as unknown as D1Database;
  const response = await handleRequest(
    new Request("https://demo.test/api/service-catalog", {
      headers: { Cookie: "of_session=synthetic-catalog-token" },
    }),
    environment,
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    services: {
      code: string;
      backend: string;
      evidence: string;
      fields: { key: string }[];
    }[];
  };
  expect(
    result.services.find((s) => s.code === "address_change"),
  ).toMatchObject({
    backend: "simulated_service",
    evidence: "directory_observed_form_inferred",
    fields: [{ key: "address" }, { key: "city" }, { key: "pincode" }],
  });
  expect(result.services.some((s) => s.code === "loan_noc")).toBe(true);
  expect(reads).toEqual([
    "SELECT * FROM sessions WHERE token_hash=? AND expires_at>?",
  ]);
  expect(coreCalls).toBe(0);
});

test("journey entry only reads permanent saved data and never provisions or calls the core", async () => {
  const { Database } = await import("bun:sqlite");
  const db = new Database(":memory:");
  const migrations: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    migrations.push(path);
  for (const path of migrations.sort()) db.exec(await Bun.file(path).text());
  db.run(
    "INSERT INTO banks(id,status,journey,customer_client,customer_account,recipient_account,employer_account) VALUES('permanent','ready','existing',1,11,22,33)",
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
  db.run(
    "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES('legacy-permanent','permanent','permanent','SYN-ORIGINAL','Mira',1,11,'00011','legacy','active')",
  );
  environment.DEMO_MODE = "true";
  let coreCalls = 0;
  environment.CORE = {
    fetch: async () => {
      coreCalls++;
      throw new Error("Unavailable core must not be called during entry");
    },
  } as unknown as Environment["CORE"];
  const response = await handleRequest(
    new Request("https://demo.test/api/customer-selection", {
      method: "POST",
      body: JSON.stringify({ customerId: "legacy-permanent" }),
    }),
    environment,
  );
  expect(response.status).toBe(200);
  const result = (await response.json()) as {
    dashboard: {
      bank: { id: string };
      account: { summary: { accountBalance: number } };
      core: { cached: boolean };
    };
  };
  expect(result.dashboard.bank.id).toBe("permanent");
  expect(result.dashboard.account.summary.accountBalance).toBe(121300);
  expect(result.dashboard.core.cached).toBe(true);
  expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; Secure");
  expect(coreCalls).toBe(0);
  expect(db.query("SELECT COUNT(*) AS n FROM banks").get()).toEqual({ n: 1 });
  db.close();
});

test("loan setup administration requires authority and demo mode, strictly parses commands and keeps saved reads Core-independent", async () => {
  let coreCalls = 0;
  const environment = env({
    prepare: () =>
      ({
        bind() {
          return this;
        },
        first: async () => null,
      }) as unknown as D1PreparedStatement,
  });
  environment.DEMO_MODE = "true";
  environment.CORE = {
    fetch: async () => {
      coreCalls++;
      throw new Error("Unexpected Core call");
    },
  } as unknown as Environment["CORE"];
  for (const [path, method] of [
    ["setup", "GET"],
    ["advance", "POST"],
    ["inspect", "POST"],
    ["quote", "POST"],
  ]) {
    const response = await handleRequest(
      new Request(`https://demo.test/api/admin/demo/loans/${path}`, { method }),
      environment,
    );
    expect(response.status).toBe(401);
  }
  const headers = {
    Authorization: "Bearer test-admin",
    "Content-Type": "application/json",
  };
  const status = () =>
    new Request("https://demo.test/api/admin/demo/loans/setup", { headers });
  expect(
    (await handleRequest(status(), { ...environment, DEMO_MODE: "false" }))
      .status,
  ).toBe(403);
  const saved = await handleRequest(status(), environment);
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({
    version: 0,
    events: [],
    next: { kind: "account", code: "OF1002" },
    pending: null,
  });
  for (const [path, body] of [
    [
      "advance",
      {
        step: { kind: "product" },
        version: 0,
        key: "some-key-111",
        extra: true,
      },
    ],
    ["inspect", { extra: true }],
    ["quote", { terms: {}, owner: "untrusted" }],
  ]) {
    expect(
      (
        await handleRequest(
          new Request(`https://demo.test/api/admin/demo/loans/${path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          }),
          environment,
        )
      ).status,
    ).toBe(400);
  }
  expect(coreCalls).toBe(0);
});

test("the native loan pilot remains protected independently of strict normal session loan instructions", async () => {
  let coreCalls = 0;
  let writes = 0;
  const environment = env({
    prepare: (sql: string) =>
      ({
        bind() {
          return this;
        },
        first: async () =>
          sql.includes("FROM settings")
            ? { value: "pilot-bank" }
            : sql.includes("FROM banks")
              ? {
                  id: "pilot-bank",
                  status: "ready",
                  journey: "existing",
                  customer_client: 41,
                  customer_account: 51,
                  recipient_client: 42,
                  recipient_account: 52,
                  employer_client: 43,
                  employer_account: 53,
                  created_at: "2026-10-17",
                }
              : sql.includes("FROM sessions")
                ? {
                    token_hash: "synthetic",
                    bank_id: "pilot-bank",
                    role: "customer",
                    expires_at: Number.MAX_SAFE_INTEGER,
                  }
                : null,
        all: async () => ({ results: [] }),
        run: async () => {
          writes++;
          throw new Error("No pilot write expected in this HTTP boundary test");
        },
      }) as unknown as D1PreparedStatement,
  });
  environment.DEMO_MODE = "true";
  environment.CORE = {
    fetch: async () => {
      coreCalls++;
      throw new Error("Unexpected Core access");
    },
  } as unknown as Environment["CORE"];
  const headers = {
    Authorization: "Bearer test-admin",
    "Content-Type": "application/json",
  };
  const call = (body: unknown, extra: HeadersInit = {}) =>
    new Request("https://demo.test/api/admin/demo/loans/pilot", {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  expect(
    (
      await handleRequest(
        new Request("https://demo.test/api/admin/demo/loans/pilot", {
          method: "POST",
        }),
        environment,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await handleRequest(call({ kind: "list", role: "customer" }), {
        ...environment,
        DEMO_MODE: "false",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await handleRequest(
        call(
          { kind: "list", role: "customer" },
          { Origin: "https://foreign.test" },
        ),
        environment,
      )
    ).status,
  ).toBe(403);
  const list = await handleRequest(
    call({ kind: "list", role: "customer" }),
    environment,
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toEqual({ loans: [] });
  for (const body of [
    { kind: "list", role: "customer", bank_id: "untrusted" },
    { kind: "quote", role: "customer", terms: {} },
    {
      kind: "submit",
      role: "customer",
      submission: { quote_id: "quote-one" },
      key: "original-key",
    },
    {
      kind: "action",
      role: "approver",
      key: "original-key",
      command: {
        id: "application-one",
        version: 1,
        action: "register",
        note: "Invented review",
        core_id: 71,
      },
    },
    { kind: "inspect", role: "approver", id: "../../private" },
  ])
    expect((await handleRequest(call(body), environment)).status).toBe(400);
  expect(
    (
      await handleRequest(
        call({ kind: "inspect", role: "customer", id: "application-one" }),
        environment,
      )
    ).status,
  ).toBe(403);
  const publicWrite = await handleRequest(
    new Request("https://demo.test/api/loans/action", {
      method: "POST",
      headers: {
        Cookie: "of_session=synthetic",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "application-one",
        version: 1,
        action: "disburse",
        note: "Invented review",
      }),
    }),
    environment,
  );
  expect(publicWrite.status).toBe(400);
  expect(coreCalls).toBe(0);
  expect(writes).toBe(0);
});
