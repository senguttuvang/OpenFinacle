import { Database } from "bun:sqlite";
import { beforeEach, expect, mock, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { Environment } from "../src/adapters/environment";
import {
  actOnServiceCase,
  listServiceCases,
  serviceCase,
  serviceCaseForKey,
  submitServiceCase,
} from "../src/application/service-cases";
import { BankingError, type Session } from "../src/domain/banking";
import { Store, type StoreService } from "../src/domain/ports";
import type { CaseAction, ServiceCase } from "../src/domain/service-cases";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../src/http");

let db: Database;
let interfere: (() => void) | undefined;
const customer: Session = {
  token_hash: "synthetic",
  bank_id: "case-bank",
  role: "customer",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" };
const approver: Session = { ...customer, role: "approver" };
const cheque = { leaves: "25", delivery: "Collect at branch" };
const address = {
  address: "14 Example Lane",
  city: "Chennai",
  pincode: "600020",
};
const initialize = async (legacy = false) => {
  db?.close();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of [
    "0001_workflows.sql",
    "0002_reversal_guard.sql",
    "0003_customer_journey.sql",
    "0004_persistent_demo.sql",
  ])
    db.exec(await Bun.file(`migrations/${file}`).text());
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('case-bank','ready',101),('other-bank','ready',202),('unopened','ready',0)",
  );
  if (legacy)
    db.run(
      "INSERT INTO service_requests(id,bank_id,kind,detail,status) VALUES('legacy-cheque','case-bank','chequebook','Earlier cheque request','open'),('legacy-product','case-bank','fixed_deposit','Earlier product application','open'),('legacy-address','case-bank','address_change','Earlier synthetic address request','open')",
    );
  db.exec(await Bun.file("migrations/0005_service_cases.sql").text());
  db.exec(await Bun.file("migrations/0006_legacy_service_guards.sql").text());
  db.exec(await Bun.file("migrations/0007_cards.sql").text());
  db.exec(await Bun.file("migrations/0008_profiles.sql").text());
  interfere = undefined;
};
beforeEach(() => initialize());
const failure = () =>
  new BankingError({ message: "Workflow persistence failed.", status: 503 });
const layer = () =>
  Layer.succeed(Store, {
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).all(...values) as T[],
        catch: failure,
      }),
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => {
          if (sql.startsWith("UPDATE service_requests") && interfere) {
            const callback = interfere;
            interfere = undefined;
            callback();
          }
          return db.query(sql).get(...values) as T | null;
        },
        catch: failure,
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.try({ try: () => db.run(sql, values).changes, catch: failure }),
  });
const run = <A, E>(task: Effect.Effect<A, E, StoreService>) =>
  Effect.runPromise(task.pipe(Effect.provide(layer())));
const denied = <A>(task: Effect.Effect<A, BankingError, StoreService>) =>
  run(task.pipe(Effect.flip));
const row = (id: string) =>
  db.query("SELECT * FROM service_requests WHERE id=?").get(id) as ServiceCase;
const action = (
  session: Session,
  id: string,
  act: CaseAction,
  note = "Reviewed synthetic request",
  fields?: Record<string, string>,
  version = row(id).version,
) =>
  actOnServiceCase(session, {
    id,
    version,
    action: act,
    note,
    ...(fields ? { fields } : {}),
  });
const submit = (
  code = "chequebook",
  fields: Record<string, string> = cheque,
  key = "case-request-key-one",
) => submitServiceCase(customer, code, fields, key);

test("case submission is persistent and idempotent without duplicate history or audit", async () => {
  const first = await run(submit());
  const repeat = await run(submit());
  expect(repeat.request.id).toBe(first.request.id);
  expect(
    (await run(serviceCaseForKey(customer, "case-request-key-one"))).request.id,
  ).toBe(first.request.id);
  expect(
    await denied(
      serviceCaseForKey(
        { ...customer, bank_id: "other-bank" },
        "case-request-key-one",
      ),
    ),
  ).toMatchObject({ status: 404 });
  expect(first.request).toMatchObject({
    status: "open",
    version: 0,
    delivery_status: "pending",
    kind: "chequebook",
  });
  expect(
    first.history.map((e) => ({ actor: e.actor, to: e.to_status })),
  ).toEqual([{ actor: "customer", to: "open" }]);
  expect(db.query("SELECT COUNT(*) AS n FROM service_requests").get()).toEqual({
    n: 1,
  });
  expect(db.query("SELECT COUNT(*) AS n FROM audit").get()).toEqual({ n: 1 });
  expect(
    await denied(submit("chequebook", { ...cheque, leaves: "50" })),
  ).toMatchObject({ status: 409 });
  expect(
    (await run(serviceCase(customer, first.request.id))).history,
  ).toHaveLength(1);
});

test("only customers with an opened account and valid fields can create a case", async () => {
  expect(
    await denied(
      submitServiceCase(officer, "chequebook", cheque, "officer-request-key"),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await denied(
      submitServiceCase(
        { ...customer, bank_id: "unopened" },
        "chequebook",
        cheque,
        "unopened-request-key",
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect(await denied(submit("not-a-service", {}))).toMatchObject({
    status: 400,
  });
  expect(await denied(submit("chequebook", cheque, ""))).toMatchObject({
    status: 400,
  });
  expect(
    await denied(submit("address_change", { ...address, status: "fulfilled" })),
  ).toMatchObject({ status: 400 });
  expect(db.query("SELECT COUNT(*) AS n FROM service_requests").get()).toEqual({
    n: 0,
  });
});

test("routine requests progress through processing, fulfilment and separate delivery", async () => {
  const { request } = await run(submit());
  expect(await denied(action(officer, request.id, "fulfil"))).toMatchObject({
    status: 403,
  });
  expect(
    (await run(action(officer, request.id, "start"))).request,
  ).toMatchObject({ status: "in_progress", version: 1 });
  expect(await denied(action(customer, request.id, "fulfil"))).toMatchObject({
    status: 403,
  });
  const completed = await run(action(officer, request.id, "fulfil"));
  expect(completed.request).toMatchObject({
    status: "fulfilled",
    delivery_status: "ready_for_collection",
    version: 2,
  });
  const delivered = await run(action(officer, request.id, "record_delivery"));
  expect(delivered.request).toMatchObject({
    status: "fulfilled",
    delivery_status: "delivered",
    version: 3,
  });
  expect(delivered.history.map((e) => e.delivery_status)).toEqual([
    "pending",
    "pending",
    "ready_for_collection",
    "delivered",
  ]);
  expect(
    await denied(action(officer, request.id, "record_delivery")),
  ).toMatchObject({ status: 403 });
  expect(await denied(action(customer, request.id, "cancel"))).toMatchObject({
    status: 403,
  });
});

test("sensitive maintenance requires independent approval and supports return for review", async () => {
  const { request } = await run(submit("address_change", address));
  await run(action(officer, request.id, "start"));
  expect(await denied(action(officer, request.id, "fulfil"))).toMatchObject({
    status: 403,
  });
  expect(await denied(action(approver, request.id, "fulfil"))).toMatchObject({
    status: 403,
  });
  await run(action(officer, request.id, "submit_for_approval"));
  expect((await run(serviceCase(officer, request.id))).actions).toEqual([]);
  expect((await run(serviceCase(approver, request.id))).actions).toEqual([
    "fulfil",
    "return_for_review",
    "reject",
  ]);
  expect(await denied(action(officer, request.id, "fulfil"))).toMatchObject({
    status: 403,
  });
  expect(await denied(action(customer, request.id, "fulfil"))).toMatchObject({
    status: 403,
  });
  await run(
    action(
      approver,
      request.id,
      "return_for_review",
      "Review the supplied address proof",
    ),
  );
  expect(row(request.id).status).toBe("in_progress");
  await run(action(officer, request.id, "submit_for_approval"));
  const completed = await run(action(approver, request.id, "fulfil"));
  expect(completed.request).toMatchObject({
    status: "fulfilled",
    version: 5,
    updated_by: "approver",
    delivery_status: "none",
  });
  expect(completed.history.map((e) => e.actor)).toEqual([
    "customer",
    "officer",
    "officer",
    "approver",
    "officer",
    "approver",
  ]);
});

test("information requests preserve original submission identity and revised field history", async () => {
  const { request } = await run(submit("address_change", address));
  await run(
    action(
      officer,
      request.id,
      "request_information",
      "Please confirm your revised address",
    ),
  );
  expect(
    await denied(
      action(
        officer,
        request.id,
        "provide_information",
        "Updated details",
        address,
      ),
    ),
  ).toMatchObject({ status: 403 });
  const revised = { ...address, address: "28 Example Avenue" };
  const updated = await run(
    action(
      customer,
      request.id,
      "provide_information",
      "Address corrected as requested",
      revised,
    ),
  );
  expect(updated.request.status).toBe("open");
  expect(JSON.parse(updated.request.payload)).toEqual(revised);
  expect(JSON.parse(updated.request.submitted_payload)).toEqual(address);
  expect(updated.request.detail).toContain("28 Example Avenue");
  expect(JSON.parse(updated.history[0].payload)).toEqual(address);
  expect(JSON.parse(updated.history[2].payload)).toEqual(revised);
  expect((await run(submit("address_change", address))).request.id).toBe(
    request.id,
  );
  expect(await denied(submit("address_change", revised))).toMatchObject({
    status: 409,
  });
});

test("case ownership, terminal state and version guards prevent unauthorized changes", async () => {
  const { request } = await run(submit());
  const foreign = { ...customer, bank_id: "other-bank" };
  expect(await denied(serviceCase(foreign, request.id))).toMatchObject({
    status: 404,
  });
  expect(
    await denied(
      action({ ...officer, bank_id: "other-bank" }, request.id, "start"),
    ),
  ).toMatchObject({ status: 404 });
  expect((await run(listServiceCases(foreign, 0, ""))).requests).toEqual([]);
  expect(
    await denied(action(officer, request.id, "reject", "no")),
  ).toMatchObject({ status: 400 });
  expect(
    await denied(
      action(officer, request.id, "start", "Valid note", undefined, -1),
    ),
  ).toMatchObject({ status: 400 });
  await run(action(officer, request.id, "start"));
  expect(
    await denied(
      action(
        officer,
        request.id,
        "request_information",
        "Provide more information",
        undefined,
        0,
      ),
    ),
  ).toMatchObject({ status: 409 });
  await run(
    action(officer, request.id, "reject", "The request is not eligible"),
  );
  expect(row(request.id).status).toBe("rejected");
  expect(await denied(action(officer, request.id, "start"))).toMatchObject({
    status: 403,
  });
  expect((await run(serviceCase(customer, request.id))).history).toHaveLength(
    3,
  );
});

test("customers can cancel eligible requests without leaving a pending delivery", async () => {
  const { request } = await run(submit());
  expect(
    await denied(action(customer, request.id, "cancel", "x".repeat(501))),
  ).toMatchObject({ status: 400 });
  const cancelled = await run(
    action(customer, request.id, "cancel", "This request is no longer needed"),
  );
  expect(cancelled.request).toMatchObject({
    status: "cancelled",
    delivery_status: "cancelled",
    version: 1,
  });
  expect(await denied(action(officer, request.id, "start"))).toMatchObject({
    status: 403,
  });
  expect(cancelled.history).toHaveLength(2);
});

test("a competing writer between read and update is not overwritten", async () => {
  const { request } = await run(submit());
  interfere = () =>
    db.run(
      "UPDATE service_requests SET status='in_progress',version=version+1,updated_by='officer',outcome_note='Another operator started processing' WHERE id=?",
      [request.id],
    );
  expect(await denied(action(officer, request.id, "start"))).toMatchObject({
    status: 409,
  });
  expect(row(request.id)).toMatchObject({
    status: "in_progress",
    version: 1,
    outcome_note: "Another operator started processing",
  });
  expect((await run(serviceCase(customer, request.id))).history).toHaveLength(
    2,
  );
});

test("failure to append history rolls back the case transition and audit", async () => {
  const { request } = await run(submit());
  db.exec(
    "CREATE TRIGGER fail_case_history BEFORE INSERT ON service_case_events WHEN NEW.to_status='in_progress' BEGIN SELECT RAISE(ABORT,'Injected history failure'); END;",
  );
  expect(await denied(action(officer, request.id, "start"))).toMatchObject({
    status: 503,
  });
  expect(row(request.id)).toMatchObject({ status: "open", version: 0 });
  expect((await run(serviceCase(customer, request.id))).history).toHaveLength(
    1,
  );
  expect(db.query("SELECT COUNT(*) AS n FROM audit").get()).toEqual({ n: 1 });
});

test("storage rejects unversioned managed writes and changes to submission identity", async () => {
  const { request } = await run(submit());
  expect(() =>
    db.run("UPDATE service_requests SET status='fulfilled' WHERE id=?", [
      request.id,
    ]),
  ).toThrow("Managed service cases require a versioned update");
  expect(() =>
    db.run(
      "UPDATE service_requests SET submitted_payload='{}',version=version+1 WHERE id=?",
      [request.id],
    ),
  ).toThrow("The service case submission identity is immutable");
  expect(row(request.id)).toMatchObject({ status: "open", version: 0 });
  expect((await run(serviceCase(customer, request.id))).history).toHaveLength(
    1,
  );
});

test("request listing is scoped, paginated and treats search wildcards literally", async () => {
  for (let i = 0; i < 27; i++)
    await run(submit("chequebook", cheque, `request-page-key-${i}`));
  const page = await run(listServiceCases(customer, 0, ""));
  expect(page).toMatchObject({ total: 27, limit: 25, offset: 0 });
  expect(page.requests).toHaveLength(25);
  const reference = `SR-${page.requests[0].id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  expect(
    (await run(listServiceCases(customer, 0, reference))).requests.map(
      (record) => record.id,
    ),
  ).toEqual([page.requests[0].id]);
  expect(
    (await run(listServiceCases(customer, 0, reference.toLowerCase(), true)))
      .total,
  ).toBe(1);
  expect(
    (
      await run(
        listServiceCases({ ...customer, bank_id: "other-bank" }, 0, reference),
      )
    ).total,
  ).toBe(0);
  expect((await run(listServiceCases(customer, 0, "--"))).total).toBe(0);
  expect((await run(listServiceCases(customer, 0, "SR-%"))).total).toBe(0);
  expect((await run(listServiceCases(customer, 25, ""))).requests).toHaveLength(
    2,
  );
  expect((await run(listServiceCases(customer, 0, "cheque"))).total).toBe(27);
  await run(
    submit(
      "email_change",
      { email: "sample@example.test", explanation: "Synthetic email update" },
      "non-delivery-request",
    ),
  );
  const deliveries = await run(listServiceCases(customer, 0, "", true));
  expect(deliveries.total).toBe(27);
  expect(
    deliveries.requests.every((record) => record.delivery_status === "pending"),
  ).toBe(true);
  expect(
    (await run(listServiceCases(customer, 25, "", true))).requests,
  ).toHaveLength(2);
  expect((await run(listServiceCases(customer, 0, "email", true))).total).toBe(
    0,
  );
  expect((await run(listServiceCases(customer, 0, "%"))).total).toBe(0);
  expect((await run(listServiceCases(customer, 0, "_"))).total).toBe(1);
  expect(await denied(listServiceCases(customer, -1, ""))).toMatchObject({
    status: 400,
  });
});

test("rollback storage guards reject old inserts and legacy completion while preserving independent review", async () => {
  await initialize(true);
  expect(() =>
    db.run(
      "INSERT INTO service_requests(id,bank_id,kind,detail) VALUES('untracked','case-bank','address_change','Synthetic details')",
    ),
  ).toThrow("stable submission key");
  expect(() =>
    db.run(
      "UPDATE service_requests SET status='fulfilled' WHERE id='legacy-address'",
    ),
  ).toThrow("versioned import update");
  expect(row("legacy-address")).toMatchObject({
    status: "open",
    request_key: null,
    version: 0,
  });
  expect(
    (await run(serviceCase(customer, "legacy-address"))).history,
  ).toHaveLength(1);
  await run(action(officer, "legacy-address", "start"));
  expect(
    await denied(action(officer, "legacy-address", "submit_for_approval")),
  ).toMatchObject({ status: 400 });
  await run(action(officer, "legacy-address", "request_information"));
  await run(
    action(
      customer,
      "legacy-address",
      "provide_information",
      "Synthetic address supplied",
      address,
    ),
  );
  await run(action(officer, "legacy-address", "start"));
  await run(action(officer, "legacy-address", "submit_for_approval"));
  expect(
    await denied(action(officer, "legacy-address", "fulfil")),
  ).toMatchObject({ status: 403 });
  const completed = await run(action(approver, "legacy-address", "fulfil"));
  expect(completed.request).toMatchObject({
    status: "fulfilled",
    request_key: "imported:legacy-address",
    version: 6,
  });
  expect(completed.history).toHaveLength(7);
});

test("migration preserves prior requests with explicit unknown history and supports structured continuation", async () => {
  await initialize(true);
  const old = await run(serviceCase(customer, "legacy-cheque"));
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
    await denied(action(officer, "legacy-product", "start")),
  ).toMatchObject({ status: 409 });
  await run(
    action(
      officer,
      "legacy-cheque",
      "request_information",
      "Please choose delivery and cheque size",
    ),
  );
  await run(
    action(
      customer,
      "legacy-cheque",
      "provide_information",
      "Details supplied for processing",
      cheque,
    ),
  );
  await run(action(officer, "legacy-cheque", "start"));
  const complete = await run(action(officer, "legacy-cheque", "fulfil"));
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
  db.run(
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
          first: async () => db.query(sql).get(...values),
          all: async () => ({ results: db.query(sql).all(...values) }),
          run: async () => ({ meta: { changes: db.run(sql, values).changes } }),
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
  const http = (path: string, body?: unknown) =>
    handleRequest(
      new Request(`https://demo.test/api${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: `of_session=${token}`,
          Origin: "https://demo.test",
          "Content-Type": "application/json",
          "Idempotency-Key": "http-case-key-one",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      environment,
    );
  expect(
    (
      await handleRequest(
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
  expect(db.query("SELECT id FROM service_requests").all()).toHaveLength(0);
  const created = await http("/service-cases", {
    code: "chequebook",
    fields: cheque,
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
  expect(row(request.id)).toMatchObject({ status: "open", version: 0 });
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
  expect(row(request.id)).toMatchObject({
    status: "fulfilled",
    version: 2,
    delivery_status: "ready_for_collection",
  });
  db.run("UPDATE sessions SET bank_id='other-bank' WHERE token_hash=?", [
    tokenHash,
  ]);
  expect((await http(`/service-cases?id=${request.id}`)).status).toBe(404);
  expect(coreCalls).toBe(0);
});
