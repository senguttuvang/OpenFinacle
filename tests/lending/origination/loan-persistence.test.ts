import { Database } from "bun:sqlite";
import { afterEach, beforeAll, expect, test } from "bun:test";
import { Effect } from "effect";
import { verifySqliteScript } from "../../../src/operations/cli/sqlite-script";
import { bankingDate } from "../../../src/platform/banking-workspace/domain/banking";
import type { LoanWriteInstruction } from "../../../src/platform/lending/domain/origination/loan-writing";
import {
  workflowQuote as quote,
  workflowQuotedAt as quoted,
  workflowResult,
} from "../../fixtures/loan-workflow";

let script = "";
let priorScript = "";
let loanMigration = "";
beforeAll(async () => {
  const paths: string[] = [];
  for await (const file of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(file);
  script = (
    await Promise.all(paths.sort().map((file) => Bun.file(file).text()))
  ).join("\n");
  priorScript = (
    await Promise.all(
      paths
        .filter((file) => file < "migrations/0013_loan_origination.sql")
        .sort()
        .map((file) => Bun.file(file).text()),
    )
  ).join("\n");
  loanMigration = await Bun.file("migrations/0013_loan_origination.sql").text();
  await Effect.runPromise(
    verifySqliteScript(script, [
      "loan_quotes",
      "loan_applications",
      "loan_operations",
      "loan_events",
      "loan_core_views",
    ]),
  );
});
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
interface Row {
  id: string;
  bank_id: string;
  quote_id: string;
  account_id: number;
  client_id: number;
  product_id: number;
  origin: string;
  accepted_at: number;
  status: string;
  maker: string | null;
  checker: string | null;
  core_id: number | null;
  withdrawal_requested: number;
  version: number;
}
const iso = (ms: number) => new Date(ms).toISOString();
const row = (db: Database, id = "application-one") =>
  db.query("SELECT * FROM loan_applications WHERE id=?").get(id) as Row;
const latest = (db: Database, minimum: number) =>
  Math.max(
    minimum,
    (
      db.query("SELECT max(at_ms) AS at FROM loan_events").get() as {
        at: number | null;
      }
    ).at ?? 0,
  );
const harness = () => {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec("PRAGMA foreign_keys=ON");
  // The exact full script passed native bail/integrity/FK verification above.
  db.exec(script);
  db.run(
    "INSERT INTO banks(id,status,customer_account,customer_client) VALUES('loan-test-bank','ready',51,41),('other-bank','ready',61,62)",
  );
  db.run(
    "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES('loan-test-bank','{}',0,0)",
  );
  db.run(
    "INSERT INTO loan_quotes(id,bank_id,account_id,client_id,product_id,quote_json,quoted_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      quote.id,
      quote.bank_id,
      quote.savings_account_id,
      quote.client_id,
      quote.product_id,
      JSON.stringify(quote),
      quoted,
      quote.expires_at,
      iso(quoted),
    ],
  );
  return db;
};
const decision = (
  db: Database,
  action = "submit",
  actor = "customer",
  changes: Partial<Row> = {},
  suppliedAt?: number,
  key = crypto.randomUUID(),
) => {
  const at = suppliedAt ?? latest(db, quoted + 1000);
  const previous = db
    .query("SELECT * FROM loan_applications WHERE id='application-one'")
    .get() as Row | null;
  const initial: Row = {
    id: "application-one",
    bank_id: quote.bank_id,
    quote_id: quote.id,
    account_id: 51,
    client_id: 41,
    product_id: 31,
    origin: "admin-pilot",
    accepted_at: quoted + 1000,
    status: "submitted",
    maker: null,
    checker: null,
    core_id: null,
    withdrawal_requested: 0,
    version: 0,
  };
  const next = { ...(previous ?? initial), ...changes };
  const version = action === "submit" ? 0 : (previous?.version ?? -1) + 1;
  const request =
    action === "submit"
      ? { quote_id: quote.id, consent: true }
      : {
          id: next.id,
          action,
          version: previous?.version,
          note: "Independent invented decision",
        };
  db.run(
    "INSERT INTO loan_events(id,loan_id,bank_id,quote_id,origin,accepted_at,command_key,request_json,actor,action,kind,note,status,maker,checker,core_id,withdrawal_requested,version,at_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'decision',?,?,?,?,?,?,?,?,?)",
    [
      crypto.randomUUID(),
      next.id,
      next.bank_id,
      next.quote_id,
      next.origin,
      next.accepted_at,
      key,
      JSON.stringify(request),
      actor,
      action,
      "Independent invented decision",
      next.status,
      next.maker,
      next.checker,
      next.core_id,
      next.withdrawal_requested,
      version,
      at,
      iso(at),
    ],
  );
};
const reserve = (
  db: Database,
  action: LoanWriteInstruction["action"] = "register",
  id = crypto.randomUUID(),
  suppliedAt?: number,
  overrides: Partial<LoanWriteInstruction> = {},
) => {
  const at = suppliedAt ?? latest(db, quoted + 2000);
  const l = row(db);
  const command: LoanWriteInstruction = {
    owner: {
      bank_id: l.bank_id,
      product_id: l.product_id,
      client_id: l.client_id,
      savings_account_id: l.account_id,
    },
    terms: quote.terms,
    quote,
    consented_at: l.accepted_at,
    expected_disbursement_date: quote.expected_disbursement_date,
    external_id: `of-loan-${l.id}`,
    action,
    key: `of-loan-op-${id}`,
    date: bankingDate(at),
    note: "Independent invented instruction",
    ...(l.core_id === null ? {} : { core_id: l.core_id }),
    ...(action === "disburse"
      ? { transaction_external_id: `of-loan-disburse-${id}` }
      : {}),
    ...overrides,
  };
  const request = { id: l.id, action, version: l.version, note: command.note };
  db.run(
    "INSERT INTO loan_operations(id,loan_id,bank_id,account_id,client_key,request_json,command_json,action,actor,original_version,status,version,started_at,observed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'approver',?,'executing',0,?,?,?,?)",
    [
      id,
      l.id,
      l.bank_id,
      l.account_id,
      crypto.randomUUID(),
      JSON.stringify(request),
      JSON.stringify(command),
      action,
      l.version,
      at,
      at,
      iso(at),
      iso(at),
    ],
  );
  return { id, command };
};
const finish = (
  db: Database,
  operation: ReturnType<typeof reserve>,
  status = "confirmed",
  suppliedAt?: number,
  result: unknown = status === "confirmed"
    ? workflowResult(operation.command)
    : null,
) => {
  const at = suppliedAt ?? latest(db, quoted + 3000);
  return db.run(
    "UPDATE loan_operations SET status=?,version=version+1,result_json=?,error=?,observed_at=?,updated_at=? WHERE id=?",
    [
      status,
      result === null ? null : JSON.stringify(result),
      status === "confirmed" ? null : "Original operation requires inspection",
      at,
      iso(at),
      operation.id,
    ],
  );
};
const recommended = () => {
  const db = harness();
  decision(db);
  decision(db, "recommend", "officer", {
    status: "recommended",
    maker: "officer",
  });
  return db;
};

test("accepted quotes, actor/version history, Core results and shared reservations form one durable origination", () => {
  const db = recommended();
  expect(row(db)).toMatchObject({
    status: "recommended",
    maker: "officer",
    checker: null,
    version: 1,
  });
  const registration = reserve(db);
  expect(row(db)).toMatchObject({
    status: "recommended",
    core_id: null,
    version: 2,
  });
  expect(
    db.query("SELECT owner_id,status FROM core_write_claims").get(),
  ).toEqual({ owner_id: registration.id, status: "executing" });
  expect(() =>
    decision(db, "cancel", "customer", { status: "cancelled" }),
  ).toThrow();
  finish(db, registration);
  expect(row(db)).toMatchObject({
    status: "registered",
    core_id: 71,
    checker: "approver",
    version: 3,
  });
  const approval = reserve(db, "approve");
  finish(db, approval);
  expect(row(db).status).toBe("approved");
  const disbursement = reserve(db, "disburse");
  finish(db, disbursement);
  expect(row(db)).toMatchObject({ status: "active", version: 7 });
  expect(
    db.query("SELECT status FROM core_write_claims ORDER BY rowid").all(),
  ).toEqual([
    { status: "confirmed" },
    { status: "confirmed" },
    { status: "confirmed" },
  ]);
  expect(db.query("SELECT COUNT(*) AS n FROM loan_events").get()).toEqual({
    n: 8,
  });
  expect(db.query("SELECT COUNT(*) AS n FROM audit").get()).toEqual({ n: 8 });
  expect(
    db.query("SELECT invalidated_at FROM financial_snapshots").get(),
  ).toEqual({ invalidated_at: quoted + 3000 });
  expect(
    db
      .query(
        "SELECT json_extract(snapshot_json,'$.status') AS status,stale FROM loan_core_views",
      )
      .get(),
  ).toEqual({ status: "active", stale: 0 });
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(() => reserve(db, "disburse")).toThrow();
});

test("unknown originals retain their claim and block decisions, new operations, cash and manual claim release", () => {
  const db = recommended();
  const operation = reserve(db);
  finish(db, operation, "uncertain");
  expect(() => finish(db, operation, "failed")).toThrow();
  expect(() => reserve(db)).toThrow();
  expect(() =>
    decision(db, "cancel", "customer", { status: "cancelled" }),
  ).toThrow();
  expect(() =>
    db.run(
      "UPDATE core_write_claims SET status='confirmed',version=version+1 WHERE owner_id=?",
      [operation.id],
    ),
  ).toThrow();
  expect(() =>
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('cash','loan-test-bank','invented-cash','deposit','pending',10000,'Invented','officer',51)",
    ),
  ).toThrow();
  finish(db, operation, "confirmed", quoted + 4000);
  expect(row(db)).toMatchObject({ status: "registered", version: 4 });
  expect(
    db.query("SELECT status,version FROM core_write_claims").get(),
  ).toEqual({ status: "confirmed", version: 2 });
});

test("definite rejection releases its owner but keeps all original input and terminal histories immutable", () => {
  const db = recommended();
  const operation = reserve(db);
  finish(db, operation, "failed");
  expect(row(db)).toMatchObject({ status: "recommended", core_id: null });
  expect(() => reserve(db)).not.toThrow();
  for (const sql of [
    "UPDATE loan_quotes SET expires_at=expires_at+1",
    "DELETE FROM loan_quotes",
    "UPDATE loan_applications SET status='active'",
    "DELETE FROM loan_applications",
    "UPDATE loan_events SET actor='customer'",
    "DELETE FROM loan_events",
    `DELETE FROM loan_operations WHERE id='${operation.id}'`,
    `UPDATE loan_operations SET command_json='{}' WHERE id='${operation.id}'`,
  ])
    expect(() => db.run(sql)).toThrow();
});

test("withdrawal intent blocks funding and requires independent undo then separate verified withdrawal", () => {
  const db = recommended();
  const registration = reserve(db);
  finish(db, registration);
  const approval = reserve(db, "approve");
  finish(db, approval);
  decision(db, "request_withdrawal", "customer", { withdrawal_requested: 1 });
  expect(() => reserve(db, "disburse")).toThrow();
  expect(() => reserve(db, "withdraw")).toThrow();
  const later = Date.parse("2026-10-18T09:00:00Z");
  const undo = reserve(db, "undo_approval", crypto.randomUUID(), later);
  finish(db, undo, "confirmed", later + 1000);
  expect(row(db)).toMatchObject({
    status: "registered",
    withdrawal_requested: 1,
  });
  const withdrawal = reserve(db, "withdraw", crypto.randomUUID(), later + 2000);
  finish(db, withdrawal, "confirmed", later + 3000);
  expect(row(db).status).toBe("withdrawn");
  expect(() =>
    reserve(db, "approve", crypto.randomUUID(), later + 4000),
  ).toThrow();
});

test("wrong ownership, actor, quote, version, banking day and uncorroborated results cannot mutate the original", () => {
  const db = recommended();
  expect(() =>
    decision(db, "cancel", "officer", { status: "cancelled" }),
  ).toThrow();
  for (const changes of [
    {
      owner: {
        bank_id: quote.bank_id,
        product_id: 31,
        client_id: 41,
        savings_account_id: 61,
      },
    },
    { quote: { ...quote, id: "another-quote" } },
    { consented_at: quoted + 2000 },
    { external_id: "of-loan-other" },
  ])
    expect(() =>
      reserve(db, "register", crypto.randomUUID(), quoted + 2000, changes),
    ).toThrow();
  expect(() =>
    reserve(db, "register", crypto.randomUUID(), quoted + 900000),
  ).toThrow();
  const registration = reserve(db);
  for (const changed of [
    {
      ...workflowResult(registration.command),
      loan: { ...workflowResult(registration.command).loan, id: 0 },
    },
    {
      ...workflowResult(registration.command),
      loan: {
        ...workflowResult(registration.command).loan,
        owner: { ...registration.command.owner, bank_id: "other-bank" },
      },
    },
    {
      ...workflowResult(registration.command),
      loan: { ...workflowResult(registration.command).loan, status: "active" },
    },
    { loan: {} },
  ])
    expect(() =>
      finish(db, registration, "confirmed", quoted + 3000, changed),
    ).toThrow();
  expect(row(db).status).toBe("recommended");
  expect(db.query("SELECT status FROM core_write_claims").get()).toEqual({
    status: "executing",
  });
});

test("failure of outcome history or saved Core-view persistence rolls back every outcome and preserves the unresolved original", () => {
  for (const target of ["loan_events", "loan_core_views"]) {
    const db = recommended();
    const operation = reserve(db);
    db.run(
      `CREATE TRIGGER injected_failure BEFORE INSERT ON ${target} BEGIN SELECT RAISE(ABORT,'Synthetic persistence failure'); END`,
    );
    expect(() => finish(db, operation)).toThrow();
    expect(row(db)).toMatchObject({ status: "recommended", version: 2 });
    expect(
      db.query("SELECT status,version FROM loan_operations").get(),
    ).toEqual({ status: "executing", version: 0 });
    expect(
      db.query("SELECT status,version FROM core_write_claims").get(),
    ).toEqual({ status: "executing", version: 0 });
    expect(db.query("SELECT COUNT(*) AS n FROM loan_events").get()).toEqual({
      n: 3,
    });
  }
});

test("legacy orphan loan reservations reject strict migration rehearsal instead of being reset or adopted", async () => {
  const seed = `INSERT INTO banks(id,status,customer_account,customer_client) VALUES('invented-bank','ready',51,41);
INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at)
VALUES('loan:old-original','loan','old-original','invented-bank',51,'loan','executing',0,'2026-10-17','2026-10-17');`;
  const error = await Effect.runPromise(
    verifySqliteScript(
      `${priorScript}\n${seed}\nBEGIN;\n${loanMigration}\nCOMMIT;\nSELECT 1;`,
    ).pipe(Effect.flip),
  );
  expect(error).toBeInstanceOf(Error);
  expect(error.message).not.toContain("old-original");
});

test("cash and loan reservation writes arbitrate both race orders, including old Worker SQL, without blocking another relationship", () => {
  for (const winner of ["cash", "loan"]) {
    const db = recommended();
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('cash','loan-test-bank','cash-original','deposit','pending',10000,'Invented','officer',51)",
    );
    const claimCash = () =>
      db.run(
        "UPDATE commands SET status='executing',approver='approver' WHERE id='cash' AND status='pending' AND NOT EXISTS(SELECT 1 FROM commands other WHERE other.bank_id='loan-test-bank' AND other.account_id=51 AND other.id<>'cash' AND other.status IN ('executing','uncertain'))",
      );
    if (winner === "cash") {
      claimCash();
      expect(() => reserve(db)).toThrow();
      expect(
        db.query("SELECT COUNT(*) AS n FROM loan_operations").get(),
      ).toEqual({ n: 0 });
      expect(row(db).version).toBe(1);
    } else {
      reserve(db);
      expect(claimCash).toThrow();
      expect(
        db.query("SELECT status FROM commands WHERE id='cash'").get(),
      ).toEqual({ status: "pending" });
    }
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('other-cash','other-bank','other-original','deposit','executing',10000,'Invented','officer',61)",
    );
    expect(
      db
        .query(
          "SELECT COUNT(*) AS n FROM core_write_claims WHERE status='executing'",
        )
        .get(),
    ).toEqual({ n: 2 });
  }
});

test("a disbursement outcome cannot release its reservation without the original complete normalized transaction and transfer", () => {
  const db = recommended();
  const registration = reserve(db);
  finish(db, registration);
  const approval = reserve(db, "approve");
  finish(db, approval);
  const disbursement = reserve(db, "disburse");
  const proof = workflowResult(disbursement.command);
  const transaction = proof.loan.disbursements[0];
  for (const disbursements of [
    [],
    [transaction, transaction],
    [{ ...transaction, external_id: "other-original" }],
    [{ ...transaction, transfer: null }],
    [{ ...transaction, reversed: true }],
  ]) {
    expect(() =>
      finish(db, disbursement, "confirmed", undefined, {
        ...proof,
        loan: { ...proof.loan, disbursements },
      }),
    ).toThrow();
  }
  expect(row(db).status).toBe("approved");
  expect(
    db.query("SELECT invalidated_at FROM financial_snapshots").get(),
  ).toEqual({ invalidated_at: quoted + 3000 });
  expect(
    db
      .query("SELECT status FROM core_write_claims WHERE owner_id=?")
      .get(disbursement.id),
  ).toEqual({ status: "executing" });
  finish(db, disbursement);
  expect(row(db).status).toBe("active");
});

test("balance reads cannot erase synchronization uncertainty while a disbursement original remains unresolved", () => {
  const db = recommended();
  const registration = reserve(db);
  finish(db, registration);
  const approval = reserve(db, "approve");
  finish(db, approval);
  const disbursement = reserve(db, "disburse");
  db.run("UPDATE financial_snapshots SET synced_at=?,invalidated_at=0", [
    quoted + 4000,
  ]);
  expect(
    db
      .query(
        "SELECT synced_at<invalidated_at AS stale FROM financial_snapshots",
      )
      .get(),
  ).toEqual({ stale: 1 });
  finish(db, disbursement, "uncertain", quoted + 5000);
  db.run("UPDATE financial_snapshots SET synced_at=?,invalidated_at=0", [
    quoted + 6000,
  ]);
  expect(
    db
      .query(
        "SELECT synced_at<invalidated_at AS stale FROM financial_snapshots",
      )
      .get(),
  ).toEqual({ stale: 1 });
  finish(db, disbursement, "confirmed", quoted + 7000);
  db.run("UPDATE financial_snapshots SET synced_at=?,invalidated_at=0", [
    quoted + 8000,
  ]);
  expect(
    db
      .query(
        "SELECT synced_at<invalidated_at AS stale FROM financial_snapshots",
      )
      .get(),
  ).toEqual({ stale: 0 });
});
