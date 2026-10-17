import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { Effect } from "effect";
import { verifySqliteScript } from "../src/cli/sqlite-script";

const base = await Bun.file("migrations/0001_workflows.sql").text();
const migration = await Bun.file(
  "migrations/0012_core_write_claims.sql",
).text();
const databases: Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const harness = (migrate = true) => {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(base);
  db.run(
    "INSERT INTO banks(id,status,customer_account) VALUES('one','ready',101),('two','ready',202)",
  );
  if (migrate) db.exec(migration);
  return db;
};
const command = (
  db: Database,
  id = "cash-one",
  status = "pending",
  bank = "one",
  account = 101,
) =>
  db.run(
    "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES(?,?,?,'deposit',?,10000,'Invented cash instruction','officer',?)",
    [id, bank, `key-${id}`, status, account],
  );
const loan = (db: Database, id = "loan-one", bank = "one", account = 101) =>
  db.run(
    "INSERT INTO core_write_claims(id,owner_kind,owner_id,bank_id,account_id,origin,status,version,created_at,updated_at) VALUES(?,'loan',?,?,?,'loan','executing',0,'2026-10-18T00:00:00Z','2026-10-18T00:00:00Z')",
    [`loan:${id}`, id, bank, account],
  );
const outcome = (db: Database, id: string, status: string) =>
  db.run(
    "UPDATE core_write_claims SET status=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
    [status, id],
  );
const statuses = (db: Database, id: string) =>
  db
    .query(
      "SELECT status FROM core_write_claim_events WHERE claim_id=? ORDER BY version",
    )
    .all(id);

test("migration observes only unresolved legacy operations without inventing past successes", () => {
  const db = harness(false);
  command(db, "old-unknown", "uncertain");
  command(db, "old-executing", "executing", "two", 202);
  command(db, "old-posted", "posted");
  db.exec(migration);
  expect(
    db
      .query(
        "SELECT owner_id,origin,status,version FROM core_write_claims ORDER BY owner_id",
      )
      .all(),
  ).toEqual([
    {
      owner_id: "old-executing",
      origin: "legacy",
      status: "executing",
      version: 0,
    },
    {
      owner_id: "old-unknown",
      origin: "legacy",
      status: "uncertain",
      version: 0,
    },
  ]);
  expect(
    db.query("SELECT COUNT(*) AS n FROM core_write_claim_events").get(),
  ).toEqual({ n: 2 });
  expect(() => loan(db)).toThrow();
  db.run(
    "UPDATE commands SET status='posted',core_id=99 WHERE id='old-unknown'",
  );
  expect(statuses(db, "command:old-unknown")).toEqual([
    { status: "uncertain" },
    { status: "confirmed" },
  ]);
});

test("strict migration rehearsal rejects conflicting legacy operations instead of silently discarding owners", async () => {
  const seed = `${base}\nINSERT INTO banks(id,status,customer_account) VALUES('one','ready',101);
INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES
('old-one','one','key-one','deposit','executing',10000,'Invented','officer',101)`;
  await Effect.runPromise(
    verifySqliteScript(`${seed};\n${migration}`, [
      "core_write_claims",
      "core_write_claim_events",
    ]),
  );
  const error = await Effect.runPromise(
    verifySqliteScript(
      `${seed},
('old-two','one','key-two','deposit','uncertain',10000,'Invented','officer',101);
BEGIN;\n${migration}\nCOMMIT;\nSELECT 1;`,
      ["core_write_claims"],
    ).pipe(Effect.flip),
  );
  expect(error).toBeInstanceOf(Error);
  expect(error.message).not.toContain("old-two");
});

test("savings and loan reservations exclude one another in either race order, including the old worker claim SQL", () => {
  for (const winner of ["loan", "command"]) {
    const db = harness();
    command(db);
    const legacyClaim = () =>
      db.run(
        "UPDATE commands SET status='executing',approver='approver' WHERE id='cash-one' AND status='pending' AND NOT EXISTS(SELECT 1 FROM commands other WHERE other.bank_id='one' AND other.account_id=101 AND other.id<>'cash-one' AND other.status IN ('executing','uncertain'))",
      );
    // Both callers may have read no active reservation; the writes still arbitrate.
    expect(
      db.query("SELECT COUNT(*) AS n FROM core_write_claims").get(),
    ).toEqual({ n: 0 });
    if (winner === "loan") {
      loan(db);
      expect(legacyClaim).toThrow();
      expect(
        db.query("SELECT status FROM commands WHERE id='cash-one'").get(),
      ).toEqual({ status: "pending" });
      expect(() => command(db, "later-pending")).toThrow();
      expect(
        db
          .query("SELECT COUNT(*) AS n FROM commands WHERE id='later-pending'")
          .get(),
      ).toEqual({ n: 0 });
    } else {
      legacyClaim();
      expect(() => loan(db)).toThrow();
      db.run("UPDATE commands SET status='uncertain' WHERE id='cash-one'");
      expect(() => loan(db)).toThrow();
      expect(statuses(db, "command:cash-one")).toEqual([
        { status: "executing" },
        { status: "uncertain" },
      ]);
    }
    expect(
      db
        .query(
          "SELECT COUNT(*) AS n FROM core_write_claims WHERE status IN ('executing','uncertain')",
        )
        .get(),
    ).toEqual({ n: 1 });
  }
});

test("known failure releases only its original reservation, while uncertainty cannot expire or be converted to failure", () => {
  const db = harness();
  command(db);
  db.run(
    "UPDATE commands SET status='executing',approver='approver' WHERE id='cash-one'",
  );
  db.run(
    "UPDATE commands SET status='failed',error='Definite rejection' WHERE id='cash-one'",
  );
  expect(statuses(db, "command:cash-one")).toEqual([
    { status: "executing" },
    { status: "failed" },
  ]);
  expect(() =>
    db.run("UPDATE commands SET status='pending' WHERE id='cash-one'"),
  ).toThrow();
  loan(db);
  outcome(db, "loan:loan-one", "uncertain");
  expect(() => outcome(db, "loan:loan-one", "failed")).toThrow();
  expect(() =>
    db.run(
      "UPDATE core_write_claims SET updated_at='2099-01-01',version=version+1 WHERE id='loan:loan-one'",
    ),
  ).toThrow();
  expect(() => command(db, "later-cash")).toThrow();
  // A future loan owner may confirm only after its separate Core corroboration contract.
  outcome(db, "loan:loan-one", "confirmed");
  expect(statuses(db, "loan:loan-one")).toEqual([
    { status: "executing" },
    { status: "uncertain" },
    { status: "confirmed" },
  ]);
  command(db, "fresh-cash");
  expect(() => loan(db)).toThrow();
});

test("owned account boundaries, original identities, authorization and terminal histories cannot be rewritten", () => {
  const db = harness();
  expect(() => loan(db, "foreign", "one", 202)).toThrow();
  loan(db);
  loan(db, "other-loan", "two", 202);
  for (const sql of [
    "UPDATE core_write_claims SET owner_id='changed',version=version+1 WHERE id='loan:loan-one'",
    "UPDATE core_write_claims SET account_id=202,version=version+1 WHERE id='loan:loan-one'",
    "UPDATE core_write_claims SET origin='legacy',version=version+1 WHERE id='loan:loan-one'",
    "DELETE FROM core_write_claims WHERE id='loan:loan-one'",
    "UPDATE banks SET customer_account=303 WHERE id='one'",
    "UPDATE banks SET status='initializing' WHERE id='one'",
  ])
    expect(() => db.run(sql)).toThrow();
  outcome(db, "loan:loan-one", "confirmed");
  expect(() => outcome(db, "loan:loan-one", "executing")).toThrow();
  command(db);
  db.run(
    "UPDATE commands SET status='executing',approver='approver' WHERE id='cash-one'",
  );
  for (const assignment of [
    "key='changed'",
    "payload='{} changed'",
    "description='Changed reason'",
    "created_at='2099-01-01'",
    "amount_minor=999",
    "maker='customer'",
    "approver='officer'",
    "account_id=202",
  ])
    expect(() =>
      db.run(`UPDATE commands SET ${assignment} WHERE id='cash-one'`),
    ).toThrow();
  expect(() => outcome(db, "command:cash-one", "confirmed")).toThrow();
  expect(() => db.run("DELETE FROM commands WHERE id='cash-one'")).toThrow();
  expect(() =>
    db.run("UPDATE commands SET status='posted' WHERE id='cash-one'"),
  ).toThrow();
  db.run("UPDATE commands SET status='posted',core_id=99 WHERE id='cash-one'");
  expect(() =>
    db.run("UPDATE commands SET core_id=100 WHERE id='cash-one'"),
  ).toThrow();
  expect(() =>
    db.run("UPDATE core_write_claim_events SET status='failed'"),
  ).toThrow();
  expect(() => db.run("DELETE FROM core_write_claim_events")).toThrow();
  expect(db.query("SELECT COUNT(*) AS n FROM core_write_claims").get()).toEqual(
    { n: 3 },
  );
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
});

test("failed atomic outcome/history persistence leaves both original instruction and reservation unresolved", () => {
  const db = harness();
  command(db);
  db.run(
    "UPDATE commands SET status='executing',approver='approver' WHERE id='cash-one'",
  );
  db.exec(
    "CREATE TRIGGER injected_claim_history_failure BEFORE INSERT ON core_write_claim_events WHEN NEW.version=1 BEGIN SELECT RAISE(ABORT,'Injected acknowledgement persistence failure'); END",
  );
  expect(() =>
    db.run(
      "UPDATE commands SET status='posted',core_id=99 WHERE id='cash-one'",
    ),
  ).toThrow();
  expect(
    db.query("SELECT status,core_id FROM commands WHERE id='cash-one'").get(),
  ).toEqual({ status: "executing", core_id: null });
  expect(
    db
      .query(
        "SELECT status,version FROM core_write_claims WHERE owner_id='cash-one'",
      )
      .get(),
  ).toEqual({ status: "executing", version: 0 });
  expect(statuses(db, "command:cash-one")).toEqual([{ status: "executing" }]);
  expect(() => loan(db)).toThrow();
});
