import { expect, test } from "bun:test";
import { serviceCase } from "../../src/platform/service-requests/application/service-cases";
import type { ServiceCase } from "../../src/platform/service-requests/domain/service-cases";
import type { Environment } from "../../src/runtime/http/environment";
import { createHarness } from "./service-cases.harness";

const harness = await createHarness();
test("rollback storage guards reject old inserts and legacy completion while preserving independent review", async () => {
  await harness.initialize(true);
  expect(() =>
    harness.db.run(
      "INSERT INTO service_requests(id,bank_id,kind,detail) VALUES('untracked','case-bank','address_change','Synthetic details')",
    ),
  ).toThrow("stable submission key");
  expect(() =>
    harness.db.run(
      "UPDATE service_requests SET status='fulfilled' WHERE id='legacy-address'",
    ),
  ).toThrow("versioned import update");
  expect(harness.row("legacy-address")).toMatchObject({
    status: "open",
    request_key: null,
    version: 0,
  });
  expect(
    (await harness.run(serviceCase(harness.customer, "legacy-address")))
      .history,
  ).toHaveLength(1);
  await harness.run(harness.action(harness.officer, "legacy-address", "start"));
  expect(
    await harness.denied(
      harness.action(harness.officer, "legacy-address", "submit_for_approval"),
    ),
  ).toMatchObject({ status: 400 });
  await harness.run(
    harness.action(harness.officer, "legacy-address", "request_information"),
  );
  await harness.run(
    harness.action(
      harness.customer,
      "legacy-address",
      "provide_information",
      "Synthetic address supplied",
      harness.address,
    ),
  );
  await harness.run(harness.action(harness.officer, "legacy-address", "start"));
  await harness.run(
    harness.action(harness.officer, "legacy-address", "submit_for_approval"),
  );
  expect(
    await harness.denied(
      harness.action(harness.officer, "legacy-address", "fulfil"),
    ),
  ).toMatchObject({ status: 403 });
  const completed = await harness.run(
    harness.action(harness.approver, "legacy-address", "fulfil"),
  );
  expect(completed.request).toMatchObject({
    status: "fulfilled",
    request_key: "imported:legacy-address",
    version: 6,
  });
  expect(completed.history).toHaveLength(7);
});

test("migration preserves prior requests with explicit unknown history and supports structured continuation", async () => {
  await harness.initialize(true);
  const old = await harness.run(serviceCase(harness.customer, "legacy-cheque"));
  expect(old.request).toMatchObject({
    status: "open",
    detail: "Earlier cheque request",
    delivery_status: "not_recorded",
  });
  expect(old.history).toMatchObject([
    {
      actor: "system",
      from_status: null,
      to_status: "open",
      note: "Existing request imported; earlier processing history is unavailable.",
    },
  ]);
  expect(
    await harness.denied(
      harness.action(harness.officer, "legacy-product", "start"),
    ),
  ).toMatchObject({ status: 409 });
  await harness.run(
    harness.action(
      harness.officer,
      "legacy-cheque",
      "request_information",
      "Please choose delivery and cheque size",
    ),
  );
  await harness.run(
    harness.action(
      harness.customer,
      "legacy-cheque",
      "provide_information",
      "Details supplied for processing",
      harness.cheque,
    ),
  );
  await harness.run(harness.action(harness.officer, "legacy-cheque", "start"));
  const complete = await harness.run(
    harness.action(harness.officer, "legacy-cheque", "fulfil"),
  );
  expect(complete.request).toMatchObject({
    status: "fulfilled",
    delivery_status: "ready_for_collection",
    request_key: "imported:legacy-cheque",
  });
  expect(complete.history).toHaveLength(5);
  expect(complete.history[0].detail).toBe("Earlier cheque request");
});

test("HTTP case actions are authenticated and the old resolve route cannot bypass the workflow", async () => {
  const token = "synthetic-service-case-cookie";
  const tokenHash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  harness.db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,'case-bank','customer',?)",
    [tokenHash, Number.MAX_SAFE_INTEGER],
  );
  let coreCalls = 0;
  const environment: Environment = {
    DB: {
      prepare: (sql: string) => {
        let values: (string | number | null)[] = [];
        return {
          bind(...parameters: (string | number | null)[]) {
            values = parameters;
            return this;
          },
          first: async () => harness.db.query(sql).get(...values),
          all: async () => ({ results: harness.db.query(sql).all(...values) }),
          run: async () => ({
            meta: { changes: harness.db.run(sql, values).changes },
          }),
        };
      },
    } as unknown as D1Database,
    DOCUMENTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    CORE: {
      fetch: async () => {
        coreCalls++;
        throw new Error("Service cases must not call core");
      },
    } as unknown as Environment["CORE"],
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "synthetic-admin",
    APP_REVISION: "case-test",
    DEMO_MODE: "true",
  };
  let httpScope = harness.customer.bank_id;
  const http = (path: string, body?: unknown) =>
    harness.handleRequest(
      new Request(`https://demo.test/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: `of_session=${token}`,
          Origin: "https://demo.test",
          "X-Customer-Scope": httpScope,
          "Content-Type": "application/json",
          "Idempotency-Key": "http-case-key-one",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      environment,
    );
  expect(
    (
      await harness.handleRequest(
        new Request("https://demo.test/api/service-cases"),
        environment,
      )
    ).status,
  ).toBe(401);
  for (const kind of [
    "address_change",
    "chequebook",
    "fixed_deposit",
    "personal_loan",
  ])
    expect(
      (
        await http("/requests", {
          kind,
          detail: "Synthetic unstructured request",
        })
      ).status,
    ).toBe(409);
  expect(
    harness.db.query("SELECT id FROM service_requests").all(),
  ).toHaveLength(0);
  const created = await http("/service-cases", {
    code: "chequebook",
    fields: harness.cheque,
  });
  expect(created.status).toBe(200);
  const { request } = (await created.json()) as { request: ServiceCase };
  expect(
    (
      await http("/service-cases/action", {
        id: request.id,
        version: 0,
        action: "force_fulfil",
      })
    ).status,
  ).toBe(400);
  expect((await http("/session/role", { role: "officer" })).status).toBe(200);
  expect((await http("/requests/resolve", { id: request.id })).status).toBe(
    409,
  );
  expect(harness.row(request.id)).toMatchObject({ status: "open", version: 0 });
  expect(
    (
      await http("/service-cases/action", {
        id: request.id,
        version: 0,
        action: "start",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await http("/service-cases/action", {
        id: request.id,
        version: 1,
        action: "fulfil",
        note: "Synthetic delivery prepared",
      })
    ).status,
  ).toBe(200);
  expect(harness.row(request.id)).toMatchObject({
    status: "fulfilled",
    version: 2,
    delivery_status: "ready_for_collection",
  });
  harness.db.run(
    "UPDATE sessions SET bank_id='other-bank' WHERE token_hash=?",
    [tokenHash],
  );
  httpScope = "other-bank";
  expect((await http(`/service-cases?id=${request.id}`)).status).toBe(404);
  expect(coreCalls).toBe(0);
});
