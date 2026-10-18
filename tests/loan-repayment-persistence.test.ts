import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Schema } from "effect";
import { verifySqliteScript } from "../src/cli/sqlite-script";
import { LoanRepaymentResult } from "../src/domain/loan-repayments";
import type { LoanWriteInstruction } from "../src/domain/loan-writing";
import {
  repaymentAfter,
  repaymentInstruction,
} from "./fixtures/loan-repayment";
import {
  workflowQuote,
  workflowQuotedAt,
  workflowResult,
} from "./fixtures/loan-workflow";

const paths: string[] = [];
for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
  paths.push(path);
const script = (
  await Promise.all(paths.sort().map((path) => Bun.file(path).text()))
).join("\n");
const tables = [
  "loan_repayment_offers",
  "loan_repayment_requests",
  "loan_repayment_operations",
  "loan_repayment_events",
];
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
type Value = string | number | null;
const insert = (db: Database, table: string, values: Record<string, Value>) =>
  db.run(
    `INSERT INTO ${table}(${Object.keys(values).join(",")}) VALUES(${Object.keys(
      values,
    )
      .map(() => "?")
      .join(",")})`,
    Object.values(values),
  );
const loanId = repaymentInstruction.offer.loan_id;
const requestId = "30000000-0000-4000-8000-000000000003";
const iso = (at: number) => new Date(at).toISOString();
const now = workflowQuotedAt + 60000;
const operationId = repaymentInstruction.operation_id;
const originalOffer = repaymentInstruction.offer;
const command = {
  ...repaymentInstruction,
  consented_at: workflowQuotedAt + 1000,
};
const request = {
  id: requestId,
  version: 1,
  action: "pay",
  note: command.note,
};
const result = Schema.decodeUnknownSync(LoanRepaymentResult)({
  operation_id: operationId,
  loan: repaymentAfter,
  loan_transaction_id: 82,
  savings_transaction_id: 102,
  transfer_id: 92,
  amount_minor: 100000,
  principal_minor: 90000,
  interest_minor: 10000,
  date: "2026-10-17",
});
const seedActive = (db: Database) => {
  db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('loan-test-bank','ready',41,51),('foreign-bank','ready',61,71)",
  );
  insert(db, "loan_quotes", {
    id: workflowQuote.id,
    bank_id: workflowQuote.bank_id,
    account_id: 51,
    client_id: 41,
    product_id: 31,
    quote_json: JSON.stringify(workflowQuote),
    quoted_at: workflowQuotedAt,
    expires_at: workflowQuote.expires_at,
    created_at: iso(workflowQuotedAt),
  });
  const event = {
    loan_id: loanId,
    bank_id: workflowQuote.bank_id,
    quote_id: workflowQuote.id,
    origin: "admin-pilot",
    accepted_at: workflowQuotedAt,
    actor: "customer",
    action: "submit",
    kind: "decision",
    note: "Invented customer acceptance",
    status: "submitted",
    maker: null,
    checker: null,
    core_id: null,
    withdrawal_requested: 0,
    version: 0,
    at_ms: workflowQuotedAt,
    created_at: iso(workflowQuotedAt),
    request_json: JSON.stringify({ quote_id: workflowQuote.id, consent: true }),
  };
  insert(db, "loan_events", {
    ...event,
    id: "orig-submit",
    command_key: "original-submit",
  });
  insert(db, "loan_events", {
    ...event,
    id: "orig-recommend",
    command_key: "original-recommend",
    actor: "officer",
    action: "recommend",
    status: "recommended",
    maker: "officer",
    version: 1,
  });
  for (const [index, action] of (
    ["register", "approve", "disburse"] as const
  ).entries()) {
    const version = 1 + index * 2;
    const id = `original-operation-${index}`;
    const input: LoanWriteInstruction = {
      owner: originalOffer.owner,
      terms: workflowQuote.terms,
      quote: workflowQuote,
      expected_disbursement_date: "2026-10-17",
      external_id: `of-loan-${loanId}`,
      action,
      key: `of-loan-op-${id}`,
      date: "2026-10-17",
      note: "Invented original authorization",
      consented_at: workflowQuotedAt,
      ...(action === "register" ? {} : { core_id: 71 }),
      ...(action === "disburse"
        ? { transaction_external_id: `of-loan-disburse-${id}` }
        : {}),
    };
    insert(db, "loan_operations", {
      id,
      loan_id: loanId,
      bank_id: workflowQuote.bank_id,
      account_id: 51,
      client_key: `original-client-${index}`,
      request_json: JSON.stringify({
        id: loanId,
        version,
        action,
        note: input.note,
      }),
      command_json: JSON.stringify(input),
      action,
      actor: "approver",
      original_version: version,
      status: "executing",
      version: 0,
      started_at: workflowQuotedAt,
      observed_at: workflowQuotedAt,
      created_at: iso(workflowQuotedAt),
      updated_at: iso(workflowQuotedAt),
    });
    db.run(
      "UPDATE loan_operations SET status='confirmed',version=1,result_json=?,observed_at=?,updated_at=? WHERE id=?",
      [
        JSON.stringify(workflowResult(input)),
        workflowQuotedAt,
        iso(workflowQuotedAt),
        id,
      ],
    );
  }
  db.run(
    "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES('loan-test-bank','{}',?,0)",
    [workflowQuotedAt],
  );
};
const harness = () => {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(script);
  seedActive(db);
  return db;
};
const offer = (db: Database, overrides: Record<string, unknown> = {}) => {
  const value = { ...originalOffer, ...overrides };
  return insert(db, "loan_repayment_offers", {
    id: value.id as string,
    loan_id: loanId,
    bank_id: workflowQuote.bank_id,
    account_id: 51,
    offer_json: JSON.stringify(value),
    quoted_at: value.quoted_at as number,
    expires_at: value.expires_at as number,
    created_at: iso(workflowQuotedAt),
  });
};
const submit = (db: Database, overrides: Record<string, Value> = {}) =>
  insert(db, "loan_repayment_events", {
    id: "repayment-submit",
    request_id: requestId,
    loan_id: loanId,
    bank_id: workflowQuote.bank_id,
    offer_id: originalOffer.id,
    origin: "customer",
    consented_at: command.consented_at,
    command_key: "repayment-submit-key",
    request_json: JSON.stringify({ offer_id: originalOffer.id, consent: true }),
    actor: "customer",
    action: "submit",
    kind: "decision",
    note: "Customer accepts owned savings partial payment",
    status: "submitted",
    maker: null,
    checker: null,
    version: 0,
    at_ms: command.consented_at,
    created_at: iso(command.consented_at),
    ...overrides,
  });
const decision = (
  db: Database,
  action = "recommend",
  actor = "officer",
  overrides: Record<string, Value> = {},
) =>
  insert(db, "loan_repayment_events", {
    id: `repayment-${action}`,
    request_id: requestId,
    loan_id: loanId,
    bank_id: workflowQuote.bank_id,
    offer_id: originalOffer.id,
    origin: "customer",
    consented_at: command.consented_at,
    command_key: `repayment-${action}-key`,
    request_json: JSON.stringify({
      id: requestId,
      version: 0,
      action,
      note: "Independently reviewed payment",
    }),
    actor,
    action,
    kind: "decision",
    note: "Independently reviewed payment",
    status:
      action === "recommend"
        ? "recommended"
        : action === "cancel"
          ? "cancelled"
          : "rejected",
    maker: action === "recommend" ? "officer" : null,
    checker: null,
    version: 1,
    at_ms: now,
    created_at: iso(now),
    ...overrides,
  });
const reserve = (db: Database, overrides: Record<string, Value> = {}) =>
  insert(db, "loan_repayment_operations", {
    id: operationId,
    request_id: requestId,
    loan_id: loanId,
    bank_id: workflowQuote.bank_id,
    account_id: 51,
    client_key: "repayment-payment-key",
    request_json: JSON.stringify(request),
    command_json: JSON.stringify(command),
    actor: "approver",
    original_version: 1,
    status: "executing",
    version: 0,
    started_at: now,
    observed_at: now,
    created_at: iso(now),
    updated_at: iso(now),
    ...overrides,
  });
const prepare = (db: Database) => {
  offer(db);
  submit(db);
  decision(db);
};
const outcome = (
  db: Database,
  status: string,
  proof: unknown = null,
  version = 0,
) =>
  db.run(
    "UPDATE loan_repayment_operations SET status=?,version=version+1,result_json=?,error=?,observed_at=?,updated_at=? WHERE id=? AND version=?",
    [
      status,
      proof === null ? null : JSON.stringify(proof),
      status === "confirmed" ? null : "Original result requires inspection",
      now + 1000,
      iso(now + 1000),
      operationId,
      version,
    ],
  );
const row = (db: Database, table: string) =>
  db.query(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 1`).get();

test("full migration and populated restore use strict sqlite, preserving origination and all repayment history", async () => {
  await Effect.runPromise(verifySqliteScript(script, tables));
  const db = harness();
  prepare(db);
  reserve(db);
  outcome(db, "confirmed", result);
  expect(row(db, "loan_repayment_requests")).toMatchObject({
    status: "paid",
    maker: "officer",
    checker: "approver",
    version: 3,
  });
  expect(row(db, "loan_applications")).toMatchObject({
    status: "active",
    version: 7,
  });
  expect(db.query("SELECT count(*) AS n FROM loan_events").get()).toEqual({
    n: 8,
  });
  expect(
    db
      .query(
        "SELECT kind,operation_status FROM loan_repayment_events ORDER BY version",
      )
      .all(),
  ).toEqual([
    { kind: "decision", operation_status: null },
    { kind: "decision", operation_status: null },
    { kind: "started", operation_status: "executing" },
    { kind: "outcome", operation_status: "confirmed" },
  ]);
  expect(row(db, "loan_core_views")).toMatchObject({
    snapshot_json: JSON.stringify(result.loan),
    stale: 0,
  });
  expect(row(db, "core_write_claims")).toMatchObject({
    owner_id: operationId,
    status: "confirmed",
    version: 1,
  });
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  const directory = await mkdtemp(
    join(tmpdir(), "openfinacle-repayment-restore-"),
  );
  try {
    const path = join(directory, "invented.sqlite");
    await Bun.write(path, db.serialize());
    const child = Bun.spawn(
      [
        "sqlite3",
        "-batch",
        "-bail",
        "-safe",
        "-init",
        "/dev/null",
        "-readonly",
        path,
        ".dump",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const dump = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(dump).toContain(operationId);
    await Effect.runPromise(verifySqliteScript(dump, tables));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("offers, consent, maker/checker and version guards reject foreign, missing, stale, fractional or changed inputs", () => {
  for (const invalid of [
    { core_id: 72 },
    { external_id: "of-loan-foreign" },
    { owner: { ...originalOffer.owner, savings_account_id: 71 } },
    { terms: { ...originalOffer.terms, principal: 9999 } },
    { amount_minor: 1.5 },
    { amount_minor: 0 },
    { amount_minor: 1200000 },
    { available_minor: 1 },
    { principal_outstanding_minor: null },
    { quoted_at: workflowQuotedAt - 86400000 },
    { expires_at: originalOffer.expires_at + 1 },
    { office_id: null },
    { payment_date: "2026-10-18" },
  ]) {
    const db = harness();
    expect(() => offer(db, invalid)).toThrow();
    expect(row(db, "loan_repayment_offers")).toBeNull();
  }
  const db = harness();
  offer(db);
  const invalidAcceptances: Record<string, Value>[] = [
    { actor: "approver" },
    { bank_id: "foreign-bank" },
    { maker: "officer" },
    { consented_at: originalOffer.expires_at, at_ms: originalOffer.expires_at },
    {
      request_json: JSON.stringify({
        offer_id: originalOffer.id,
        consent: false,
      }),
    },
    { version: 1 },
    { offer_id: "foreign" },
  ];
  for (const invalid of invalidAcceptances)
    expect(() => submit(db, invalid)).toThrow();
  submit(db);
  expect(() =>
    submit(db, {
      id: "second-submit",
      request_id: "second-request",
      command_key: "second-key",
    }),
  ).toThrow();
  for (const actor of ["customer", "approver"])
    expect(() => decision(db, "recommend", actor)).toThrow();
  expect(() =>
    decision(db, "recommend", "officer", { at_ms: originalOffer.expires_at }),
  ).toThrow();
  expect(() => reserve(db)).toThrow();
  decision(db);
  const invalidReservations: Record<string, Value>[] = [
    { actor: "officer" },
    { original_version: 0 },
    { account_id: 71 },
    {
      started_at: originalOffer.expires_at,
      observed_at: originalOffer.expires_at,
    },
    {
      command_json: JSON.stringify({ ...command, key: "changed-original-key" }),
    },
    {
      command_json: JSON.stringify({
        ...command,
        consented_at: command.consented_at + 1,
      }),
    },
    {
      command_json: JSON.stringify({
        ...command,
        offer: { ...originalOffer, amount_minor: 200000 },
      }),
    },
  ];
  for (const invalid of invalidReservations)
    expect(() => reserve(db, invalid)).toThrow();
  expect(row(db, "loan_repayment_operations")).toBeNull();
  reserve(db);
});

test("both race orders exclude legacy cash writes and all unknown observations remain stale until positive original proof", () => {
  for (const winner of ["cash", "repayment"]) {
    const db = harness();
    prepare(db);
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('racing-cash','loan-test-bank','racing-cash-key','deposit','pending',10000,'Invented racing cash','officer',51)",
    );
    const cash = () =>
      db.run(
        "UPDATE commands SET status='executing',approver='approver' WHERE id='racing-cash' AND status='pending'",
      );
    if (winner === "cash") {
      cash();
      expect(() => reserve(db)).toThrow();
      db.run("UPDATE commands SET status='failed' WHERE id='racing-cash'");
      reserve(db);
    } else {
      reserve(db);
      expect(cash).toThrow();
      expect(
        db.query("SELECT status FROM commands WHERE id='racing-cash'").get(),
      ).toEqual({ status: "pending" });
    }
    expect(row(db, "loan_core_views")).toMatchObject({ stale: 1 });
    outcome(db, "uncertain");
    for (const status of ["failed", "executing", "uncertain"])
      expect(() => outcome(db, status, null, 1)).toThrow();
    const freshCash = () =>
      db.run(
        "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('later-cash','loan-test-bank','later-cash-key','deposit','pending',10000,'Invented later cash','officer',51)",
      );
    expect(freshCash).toThrow();
    expect(() =>
      db.run("UPDATE banks SET customer_account=99 WHERE id='loan-test-bank'"),
    ).toThrow();
    for (const table of [
      "loan_repayment_offers",
      "loan_repayment_requests",
      "loan_repayment_operations",
      "loan_repayment_events",
    ])
      expect(() => db.run(`DELETE FROM ${table}`)).toThrow();
    db.run(
      "UPDATE financial_snapshots SET synced_at=?,invalidated_at=0 WHERE bank_id='loan-test-bank'",
      [now + 500],
    );
    expect(row(db, "financial_snapshots")).toMatchObject({
      synced_at: now + 500,
      invalidated_at: now + 501,
    });
    db.run("UPDATE loan_core_views SET stale=0,synced_at=?", [now + 500]);
    expect(row(db, "loan_core_views")).toMatchObject({ stale: 1 });
    outcome(db, "confirmed", result, 1);
    expect(row(db, "loan_repayment_requests")).toMatchObject({
      status: "paid",
      version: 4,
    });
    expect(row(db, "loan_core_views")).toMatchObject({ stale: 0 });
    db.run(
      "UPDATE financial_snapshots SET synced_at=?,invalidated_at=0 WHERE bank_id='loan-test-bank'",
      [now + 2000],
    );
    expect(row(db, "financial_snapshots")).toMatchObject({ invalidated_at: 0 });
    freshCash();
    db.run(
      "UPDATE commands SET status='executing',approver='approver' WHERE id='later-cash'",
    );
  }
});

test("confirmation rejects swapped original evidence and atomic failures preserve the reservation, history and old Core view", () => {
  const db = harness();
  prepare(db);
  reserve(db);
  const changed = [
    { operation_id: crypto.randomUUID() },
    { amount_minor: 90000 },
    { date: "2026-10-18" },
    { savings_transaction_id: 0 },
    { transfer_id: 93 },
    { loan: { ...result.loan, id: 72 } },
    {
      loan: { ...result.loan, owner: { ...result.loan.owner, client_id: 61 } },
    },
    {
      loan: {
        ...result.loan,
        statement: { ...result.loan.statement, transactions: [] },
      },
    },
    {
      loan: {
        ...result.loan,
        statement: {
          ...result.loan.statement,
          transactions: result.loan.statement?.transactions.map((t) => ({
            ...t,
            manually_reversed: true,
          })),
        },
      },
    },
    {
      loan: {
        ...result.loan,
        statement: {
          ...result.loan.statement,
          transactions: [
            ...(result.loan.statement?.transactions ?? []),
            result.loan.statement?.transactions.at(-1),
          ],
        },
      },
    },
  ];
  for (const invalid of changed) {
    expect(() => outcome(db, "confirmed", { ...result, ...invalid })).toThrow();
    expect(row(db, "loan_repayment_operations")).toMatchObject({
      status: "executing",
      version: 0,
    });
  }
  for (const assignment of [
    "command_json='{}'",
    "client_key='changed'",
    "request_id='foreign'",
    "original_version=99",
    "account_id=71",
    "actor='officer'",
  ])
    expect(() =>
      db.run(
        `UPDATE loan_repayment_operations SET ${assignment},status='uncertain',version=1 WHERE id=?`,
        [operationId],
      ),
    ).toThrow();
  db.exec(
    "CREATE TRIGGER injected_repayment_history BEFORE INSERT ON loan_repayment_events WHEN NEW.kind='outcome' BEGIN SELECT RAISE(ABORT,'Injected history failure'); END",
  );
  expect(() => outcome(db, "confirmed", result)).toThrow();
  expect(row(db, "core_write_claims")).toMatchObject({
    status: "executing",
    version: 0,
  });
  expect(row(db, "loan_repayment_requests")).toMatchObject({
    status: "recommended",
    version: 2,
  });
  expect(row(db, "loan_core_views")).toMatchObject({ stale: 1 });
  db.exec("DROP TRIGGER injected_repayment_history");
  outcome(db, "confirmed", result);
  expect(() => outcome(db, "uncertain", null, 1)).toThrow();
});

test("cancellation and definite failure retain immutable consent and allow separately reviewed later attempts only", () => {
  const db = harness();
  offer(db);
  submit(db);
  expect(() => decision(db, "cancel", "officer")).toThrow();
  decision(db, "cancel", "customer");
  expect(() => reserve(db)).toThrow();
  expect(row(db, "loan_repayment_requests")).toMatchObject({
    status: "cancelled",
  });
  expect(() =>
    db.run(
      "UPDATE loan_repayment_requests SET status='submitted',version=version+1",
    ),
  ).toThrow();
  const second = harness();
  prepare(second);
  reserve(second);
  outcome(second, "failed");
  expect(row(second, "core_write_claims")).toMatchObject({ status: "failed" });
  expect(() =>
    reserve(second, { id: crypto.randomUUID(), client_key: "new-attempt-key" }),
  ).toThrow();
  const id = crypto.randomUUID();
  const retry = { ...command, operation_id: id, key: `of-loan-repay-op-${id}` };
  reserve(second, {
    id,
    client_key: "new-attempt-key",
    original_version: 3,
    request_json: JSON.stringify({ ...request, version: 3 }),
    command_json: JSON.stringify(retry),
    started_at: now + 1000,
    observed_at: now + 1000,
  });
  expect(
    second
      .query("SELECT status FROM loan_repayment_operations ORDER BY rowid")
      .all(),
  ).toEqual([{ status: "failed" }, { status: "executing" }]);
});

test("Indian midnight blocks dispatch even within fifteen minutes and orphan claims cannot own lending operations", () => {
  const db = harness();
  const quoted = Date.parse("2026-10-17T18:29:00Z");
  const accepted = quoted + 1000;
  const midnight = quoted + 61000;
  const lateOffer = {
    ...originalOffer,
    quoted_at: quoted,
    expires_at: quoted + 900000,
  };
  offer(db, lateOffer);
  submit(db, { consented_at: accepted, at_ms: accepted });
  decision(db, "recommend", "officer", {
    consented_at: accepted,
    at_ms: quoted + 2000,
  });
  const lateCommand = { ...command, offer: lateOffer, consented_at: accepted };
  expect(() =>
    reserve(db, {
      command_json: JSON.stringify(lateCommand),
      started_at: midnight,
      observed_at: midnight,
    }),
  ).toThrow();
  reserve(db, {
    command_json: JSON.stringify(lateCommand),
    started_at: quoted + 3000,
    observed_at: quoted + 3000,
  });
  expect(row(db, "loan_repayment_operations")).toMatchObject({
    status: "executing",
  });
  const other = harness();
  expect(() =>
    other.run(
      "INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at) VALUES('loan:orphan','loan','orphan','loan-test-bank',51,'loan','executing',0,'same','same')",
    ),
  ).toThrow();
  expect(() =>
    other.run(
      "UPDATE core_write_claims SET status='uncertain',version=version+1 WHERE owner_id='original-operation-0'",
    ),
  ).toThrow();
  expect(row(other, "loan_applications")).toMatchObject({
    status: "active",
    version: 7,
  });
});
