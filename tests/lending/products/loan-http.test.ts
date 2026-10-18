import { Database } from "bun:sqlite";
import { afterEach, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { Effect } from "effect";
import { verifySqliteScript } from "../../../src/operations/cli/sqlite-script";
import type { LoanDetail } from "../../../src/platform/lending/domain/origination/loan-workflow";
import type { Environment } from "../../../src/runtime/http/environment";
import { loanView } from "../../fixtures/loan-view";

mock.module("@cloudflare/containers", () => ({
  getContainer: (namespace: unknown) => namespace,
}));
const { handleRequest } = await import("../../../src/runtime/http/http");
let ddl = "";
let db: Database;
let environment: Environment;
let coreCalls = 0;
const token = "independently-invented-loan-session";
const tokenHash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
let fixture: LoanDetail;
beforeAll(async () => {
  const files: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    files.push(path);
  ddl = (
    await Promise.all(files.sort().map((path) => Bun.file(path).text()))
  ).join("\n");
  await Effect.runPromise(
    verifySqliteScript(ddl, [
      "loan_applications",
      "loan_events",
      "loan_operations",
    ]),
  );
});
beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(ddl);
  coreCalls = 0;
  fixture = loanView("loan-test-bank", Date.now() - 1000);
  db.run(
    "INSERT INTO banks(id,status,journey,customer_client,customer_account,recipient_account,employer_account) VALUES('loan-test-bank','ready','existing',41,51,52,53),('other-bank','ready','existing',61,71,72,73)",
  );
  db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES(?,'loan-test-bank','customer',?)",
    [tokenHash, Number.MAX_SAFE_INTEGER],
  );
  const q = fixture.quote;
  db.run(
    "INSERT INTO loan_quotes(id,bank_id,account_id,client_id,product_id,quote_json,quoted_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      q.id,
      q.bank_id,
      q.savings_account_id,
      q.client_id,
      q.product_id,
      JSON.stringify(q),
      q.quoted_at,
      q.expires_at,
      new Date(q.quoted_at).toISOString(),
    ],
  );
  environment = {
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
        throw new Error("Unexpected Core access in saved/decision HTTP test");
      },
    } as unknown as Environment["CORE"],
    DOCUMENTS: {} as R2Bucket,
    ASSETS: {} as Fetcher,
    CORE_DATABASE: "unused",
    CORE_PASSWORD: "unused",
    ADMIN_TOKEN: "invented-admin",
    APP_REVISION: "loan-http-test",
    DEMO_MODE: "true",
  };
});
afterEach(() => db.close());
const http = (
  path: string,
  body?: unknown,
  key = "invented-http-key",
  headers: Record<string, string> = {},
) =>
  handleRequest(
    new Request(`https://demo.test/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: `of_session=${token}`,
        Origin: "https://demo.test",
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    environment,
  );
const role = (value: string) =>
  db.run("UPDATE sessions SET role=? WHERE token_hash=?", [value, tokenHash]);

test("repayment pilot is demo-admin only and rejects ambiguous selectors, bad fields and wrong roles before Core", async () => {
  const path = "/admin/demo/loans/repayments";
  const id = "b60427be-942d-45f5-b19a-36b855babbc3";
  expect(
    (await http(path, { kind: "list", role: "customer", loan_id: id })).status,
  ).toBe(401);
  const headers = { Authorization: "Bearer invented-admin" };
  environment.DEMO_MODE = "false";
  expect(
    (
      await http(
        path,
        { kind: "list", role: "customer", loan_id: id },
        "original-key",
        headers,
      )
    ).status,
  ).toBe(403);
  environment.DEMO_MODE = "true";
  db.run(
    "INSERT INTO settings(key,value) VALUES('demo_existing_bank','loan-test-bank')",
  );
  expect(
    (
      await http(
        `${path}?loan_id=${id}`,
        { kind: "list", role: "customer", loan_id: id },
        "original-key",
        headers,
      )
    ).status,
  ).toBe(400);
  const invalid = [
    { kind: "list", role: "customer" },
    { kind: "list", role: "customer", loan_id: id, bank_id: "foreign-bank" },
    {
      kind: "quote",
      role: "customer",
      input: { loan_id: id, amount_minor: 1.5 },
    },
    {
      kind: "submit",
      role: "customer",
      submission: { offer_id: id, consent: false },
      key: "original-key",
    },
  ];
  for (const input of invalid)
    expect((await http(path, input, "original-key", headers)).status).toBe(400);
  expect(
    (
      await http(
        path,
        {
          kind: "quote",
          role: "officer",
          input: { loan_id: id, amount_minor: 100000 },
        },
        "original-key",
        headers,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await http(
        path,
        { kind: "list", role: "customer", loan_id: id },
        "original-key",
        headers,
      )
    ).status,
  ).toBe(404);
  expect(coreCalls).toBe(0);
});
const submit = () =>
  http("/loans", { quote_id: fixture.quote.id, consent: true });
const readDetail = async (response: Response) => {
  expect(response.status).toBe(200);
  return (await response.json()) as LoanDetail;
};

test("normal loan routes require a session and demo mode and reject ambiguous or untrusted request fields before Core", async () => {
  expect(
    (
      await handleRequest(
        new Request("https://demo.test/api/loans/statement?id=application-one"),
        environment,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await handleRequest(
        new Request("https://demo.test/api/loans"),
        environment,
      )
    ).status,
  ).toBe(401);
  for (const suffix of [
    "?id=short",
    "?id=application-one&key=original-one",
    "?id=application-one&id=application-two",
    "?bank_id=other-bank",
    "?refresh=true",
  ])
    expect((await http(`/loans${suffix}`)).status).toBe(400);
  for (const suffix of [
    "",
    "?id=short",
    "?id=application-one&id=application-two",
    "?id=application-one&format=csv",
    "?key=original-one",
  ])
    expect((await http(`/loans/statement${suffix}`)).status).toBe(400);
  expect((await http("/loans", { quote_id: fixture.quote.id })).status).toBe(
    400,
  );
  for (const field of ["bank_id", "role", "origin", "core_id"])
    expect(
      (
        await http("/loans", {
          quote_id: fixture.quote.id,
          consent: true,
          [field]: "untrusted",
        })
      ).status,
    ).toBe(400);
  expect(
    (
      await http(
        "/loans",
        { quote_id: fixture.quote.id, consent: true },
        "invented-http-key",
        { Origin: "https://foreign.test" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await http("/loans", { quote_id: fixture.quote.id, consent: true }, ""))
      .status,
  ).toBe(400);
  environment.DEMO_MODE = "false";
  for (const [path, body] of [
    ["/loans", undefined],
    ["/loans/quote", fixture.quote.terms],
    ["/loans/inspect", { id: fixture.loan.id }],
    ["/loans/refresh", { id: fixture.loan.id }],
    [`/loans/statement?id=${fixture.loan.id}`, undefined],
  ] as const)
    expect((await http(path, body)).status).toBe(503);
  expect(coreCalls).toBe(0);
  expect(db.query("SELECT id FROM loan_applications").all()).toHaveLength(0);
});
test("normal customer submission records customer origin, strict acceptance and one original receipt; saved recovery never reaches Core", async () => {
  expect(await (await http("/loans")).json()).toEqual({ loans: [] });
  const saved = await readDetail(await submit());
  expect((await http(`/loans/statement?id=${saved.loan.id}`)).status).toBe(409);
  expect(saved.loan.origin).toBe("customer");
  expect(saved.loan.version).toBe(0);
  expect(saved.recorded_actor).toBe("customer");
  expect(saved.recorded_key).toBe("invented-http-key");
  expect((await readDetail(await submit())).loan.id).toBe(saved.loan.id);
  const recovered = await readDetail(
    await http("/loans?key=invented-http-key"),
  );
  expect(recovered.recorded_request).toEqual({
    quote_id: fixture.quote.id,
    consent: true,
  });
  expect(
    (await readDetail(await http(`/loans?id=${saved.loan.id}`))).history,
  ).toHaveLength(1);
  expect((await http("/loans/inspect", { id: saved.loan.id })).status).toBe(
    403,
  );
  expect((await http("/loans/refresh", { id: saved.loan.id })).status).toBe(
    409,
  );
  db.run("UPDATE sessions SET bank_id='other-bank' WHERE token_hash=?", [
    tokenHash,
  ]);
  expect((await http(`/loans?id=${saved.loan.id}`)).status).toBe(404);
  expect((await http(`/loans/statement?id=${saved.loan.id}`)).status).toBe(404);
  expect((await http("/loans?key=invented-http-key")).status).toBe(404);
  expect(await (await http("/loans")).json()).toEqual({ loans: [] });
  expect(coreCalls).toBe(0);
});
test("HTTP decisions use saved role, version and original key rather than trusting a caller actor or bypassing assessment", async () => {
  const saved = await readDetail(await submit());
  const command = {
    id: saved.loan.id,
    version: 0,
    action: "recommend",
    note: "Reviewed independently invented purpose and budget.",
  };
  expect(
    (await http("/loans/action", command, "officer-review-key")).status,
  ).toBe(403);
  role("officer");
  expect((await http("/loans/quote", fixture.quote.terms)).status).toBe(403);
  expect((await submit()).status).toBe(403);
  expect(
    (
      await http(
        "/loans/action",
        { ...command, actor: "approver" },
        "officer-review-key",
      )
    ).status,
  ).toBe(400);
  const recommended = await readDetail(
    await http("/loans/action", command, "officer-review-key"),
  );
  expect(recommended.loan.status).toBe("recommended");
  expect(recommended.history).toHaveLength(2);
  expect(
    (
      await readDetail(
        await http("/loans/action", command, "officer-review-key"),
      )
    ).history,
  ).toHaveLength(2);
  expect(
    (
      await http(
        "/loans/action",
        { ...command, action: "register", version: 1 },
        "untrusted-register-key",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await http(
        "/loans/action",
        { ...command, action: "reject" },
        "stale-review-key",
      )
    ).status,
  ).toBe(409);
  role("approver");
  expect(
    (await readDetail(await http("/loans/inspect", { id: saved.loan.id }))).loan
      .status,
  ).toBe("recommended");
  expect(
    (
      await http(
        "/loans/action",
        { ...command, action: "disburse", version: 1 },
        "invalid-funding-key",
      )
    ).status,
  ).toBe(403);
  expect(
    (await http("/loans/inspect", { id: saved.loan.id, bank_id: "other-bank" }))
      .status,
  ).toBe(400);
  const rejected = await readDetail(
    await http(
      "/loans/action",
      { ...command, action: "reject", version: 1 },
      "final-reject-key",
    ),
  );
  expect(rejected.loan.status).toBe("rejected");
  expect(rejected.history).toHaveLength(3);
  expect(rejected.actions).toEqual([]);
  expect(coreCalls).toBe(0);
  expect(db.query("SELECT id FROM loan_operations").all()).toHaveLength(0);
});
