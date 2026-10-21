import { afterEach, expect, mock, test } from "bun:test";
import { Effect } from "effect";
import {
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../../src/demo/customers/customer-provisioning";
import type { Environment } from "../../src/runtime/http/environment";
import { customerHarness } from "../fixtures/customer-banking";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../../src/runtime/http/http");
const fixtures: ReturnType<typeof customerHarness>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.db.close();
});
test("owning HTTP router gates demo/authority/origin/scope and cached explicit selection never provisions or calls Core", async () => {
  const h = customerHarness();
  fixtures.push(h);
  await Effect.runPromise(
    prepareCustomerManifest("branch").pipe(Effect.provide(h.layer)),
  );
  await Effect.runPromise(
    resumeCustomerSeed("branch", 1, 1).pipe(Effect.provide(h.layer)),
  );
  const token = "original-registered-reviewer";
  const tokenHash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  h.db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,'branch','customer',?)",
    [tokenHash, Date.now() + 100000],
  );
  let coreCalls = 0;
  const env: Environment = {
    DB: {
      prepare: (sql: string) => {
        let values: (string | number | null)[] = [];
        return {
          bind(...input: (string | number | null)[]) {
            values = input;
            return this;
          },
          first: async () => h.db.query(sql).get(...values),
          all: async () => ({ results: h.db.query(sql).all(...values) }),
          run: async () => ({
            meta: { changes: h.db.run(sql, values).changes },
          }),
        };
      },
    } as unknown as D1Database,
    CORE: {
      fetch: async () => {
        coreCalls++;
        throw new Error("Cached entry must not contact Core");
      },
    } as unknown as Environment["CORE"],
    DOCUMENTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "invented-customer-admin",
    APP_REVISION: "customer-http-proof",
    DEMO_MODE: "true",
  };
  const http = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    handleRequest(
      new Request(`https://demo.test/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: `of_session=${token}`,
          Origin: "https://demo.test",
          "Content-Type": "application/json",
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  expect((await http("/customers")).status).toBe(200);
  env.DEMO_MODE = "false";
  expect((await http("/customers")).status).toBe(503);
  expect((await http("/customers/payees")).status).toBe(503);
  expect(
    (
      await http(
        "/admin/demo/payees",
        { action: "status", branchId: "branch", start: 1, limit: 1 },
        { Authorization: "Bearer invented-customer-admin" },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await http(
        "/admin/demo/customers",
        {},
        { Authorization: "Bearer invented-customer-admin" },
      )
    ).status,
  ).toBe(403);
  env.DEMO_MODE = "true";
  expect(
    (
      await http("/admin/demo/payees", {
        action: "status",
        branchId: "branch",
        start: 1,
        limit: 1,
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await http(
        "/admin/demo/payees",
        { action: "status", branchId: "branch", start: 1, limit: 11 },
        { Authorization: "Bearer invented-customer-admin" },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await http(
        "/admin/demo/payees",
        { action: "status", branchId: "branch", start: 1, limit: 1 },
        { Authorization: "Bearer invented-customer-admin" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await http("/customers/payees", undefined, {
        "X-Customer-Scope": "stale",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await http("/customers/payees", undefined, {
        "X-Customer-Scope": "branch",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http(
        "/customers/payees/review",
        {
          holderName: "Aadhya Iyer",
          accountNumber: "SYN00000200",
          ownerId: "other",
        },
        { "X-Customer-Scope": "branch" },
      )
    ).status,
  ).toBe(400);
  expect((await http("/admin/demo/customers", {})).status).toBe(401);
  expect((await http("/session", { journey: "existing" })).status).toBe(400);
  expect(
    (
      await http(
        "/customer-transfers/review",
        { recipientId: "sample-branch-001", amount: "1" },
        { Origin: "https://foreign.test" },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await http("/customer-transfers/review", {
        recipientId: "sample-branch-001",
        amount: "1",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await http(
        "/customer-transfers/review",
        { recipientId: "sample-branch-001", amount: "1" },
        { "X-Customer-Scope": "stale" },
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await http(
        "/customer-transfers/review",
        { recipientId: "sample-branch-001", amount: "1", toAccountId: 14 },
        { "X-Customer-Scope": "branch" },
      )
    ).status,
  ).toBe(400);
  const selected = await http("/customer-selection", {
    customerId: "sample-branch-001",
  });
  expect(selected.status).toBe(200);
  const value = (await selected.json()) as {
    dashboard: {
      bank: { id: string; applicant: boolean };
      customer: { display_name: string };
      core: { cached: boolean };
    };
  };
  expect(value.dashboard.bank).toMatchObject({
    id: "sample-branch-001",
    applicant: false,
  });
  expect(value.dashboard.customer.display_name).toBe("Aadhya Iyer");
  expect(value.dashboard.core.cached).toBe(true);
  expect((await http("/dashboard")).status).toBe(401);
  expect(coreCalls).toBe(0);
});
