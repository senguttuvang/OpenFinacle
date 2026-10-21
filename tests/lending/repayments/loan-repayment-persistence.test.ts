import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { verifySqliteScript } from "../../../src/operations/cli/sqlite-script";
import { workflowQuotedAt } from "../../fixtures/loan-workflow";
import {
  createHarness,
  type Value,
} from "./loan-repayment-persistence.harness";

const harness = await createHarness();

test("full migration and populated restore use strict sqlite, preserving origination and all repayment history", async () => {
  await Effect.runPromise(verifySqliteScript(harness.script, harness.tables));
  const db = harness.harness();
  harness.prepare(db);
  harness.reserve(db);
  harness.outcome(db, "confirmed", harness.result);
  expect(harness.row(db, "loan_repayment_requests")).toMatchObject({
    status: "paid",
    maker: "officer",
    checker: "approver",
    version: 3,
  });
  expect(harness.row(db, "loan_applications")).toMatchObject({
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
  expect(harness.row(db, "loan_core_views")).toMatchObject({
    snapshot_json: JSON.stringify(harness.result.loan),
    stale: 0,
  });
  expect(harness.row(db, "core_write_claims")).toMatchObject({
    owner_id: harness.operationId,
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
    expect(dump).toContain(harness.operationId);
    await Effect.runPromise(verifySqliteScript(dump, harness.tables));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("offers, consent, maker/checker and version guards reject foreign, missing, stale, fractional or changed inputs", () => {
  for (const invalid of [
    { core_id: 72 },
    { external_id: "of-loan-foreign" },
    { owner: { ...harness.originalOffer.owner, savings_account_id: 71 } },
    { terms: { ...harness.originalOffer.terms, principal: 9999 } },
    { amount_minor: 1.5 },
    { amount_minor: 0 },
    { amount_minor: 1200000 },
    { available_minor: 1 },
    { principal_outstanding_minor: null },
    { quoted_at: workflowQuotedAt - 86400000 },
    { expires_at: harness.originalOffer.expires_at + 1 },
    { office_id: null },
    { payment_date: "2026-10-18" },
  ]) {
    const db = harness.harness();
    expect(() => harness.offer(db, invalid)).toThrow();
    expect(harness.row(db, "loan_repayment_offers")).toBeNull();
  }
  const db = harness.harness();
  harness.offer(db);
  const invalidAcceptances: Record<string, Value>[] = [
    { actor: "approver" },
    { bank_id: "foreign-bank" },
    { maker: "officer" },
    {
      consented_at: harness.originalOffer.expires_at,
      at_ms: harness.originalOffer.expires_at,
    },
    {
      request_json: JSON.stringify({
        offer_id: harness.originalOffer.id,
        consent: false,
      }),
    },
    { version: 1 },
    { offer_id: "foreign" },
  ];
  for (const invalid of invalidAcceptances)
    expect(() => harness.submit(db, invalid)).toThrow();
  harness.submit(db);
  expect(() =>
    harness.submit(db, {
      id: "second-submit",
      request_id: "second-request",
      command_key: "second-key",
    }),
  ).toThrow();
  for (const actor of ["customer", "approver"])
    expect(() => harness.decision(db, "recommend", actor)).toThrow();
  expect(() =>
    harness.decision(db, "recommend", "officer", {
      at_ms: harness.originalOffer.expires_at,
    }),
  ).toThrow();
  expect(() => harness.reserve(db)).toThrow();
  harness.decision(db);
  const invalidReservations: Record<string, Value>[] = [
    { actor: "officer" },
    { original_version: 0 },
    { account_id: 71 },
    {
      started_at: harness.originalOffer.expires_at,
      observed_at: harness.originalOffer.expires_at,
    },
    {
      command_json: JSON.stringify({
        ...harness.command,
        key: "changed-original-key",
      }),
    },
    {
      command_json: JSON.stringify({
        ...harness.command,
        consented_at: harness.command.consented_at + 1,
      }),
    },
    {
      command_json: JSON.stringify({
        ...harness.command,
        offer: { ...harness.originalOffer, amount_minor: 200000 },
      }),
    },
  ];
  for (const invalid of invalidReservations)
    expect(() => harness.reserve(db, invalid)).toThrow();
  expect(harness.row(db, "loan_repayment_operations")).toBeNull();
  harness.reserve(db);
});

test("both race orders exclude legacy cash writes and all unknown observations remain stale until positive original proof", () => {
  for (const winner of ["cash", "repayment"]) {
    const db = harness.harness();
    harness.prepare(db);
    db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('racing-cash','loan-test-bank','racing-cash-key','deposit','pending',10000,'Invented racing cash','officer',51)",
    );
    const cash = () =>
      db.run(
        "UPDATE commands SET status='executing',approver='approver' WHERE id='racing-cash' AND status='pending'",
      );
    if (winner === "cash") {
      cash();
      expect(() => harness.reserve(db)).toThrow();
      db.run("UPDATE commands SET status='failed' WHERE id='racing-cash'");
      harness.reserve(db);
    } else {
      harness.reserve(db);
      expect(cash).toThrow();
      expect(
        db.query("SELECT status FROM commands WHERE id='racing-cash'").get(),
      ).toEqual({ status: "pending" });
    }
    expect(harness.row(db, "loan_core_views")).toMatchObject({ stale: 1 });
    harness.outcome(db, "uncertain");
    for (const status of ["failed", "executing", "uncertain"])
      expect(() => harness.outcome(db, status, null, 1)).toThrow();
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
      [harness.now + 500],
    );
    expect(harness.row(db, "financial_snapshots")).toMatchObject({
      synced_at: harness.now + 500,
      invalidated_at: harness.now + 501,
    });
    db.run("UPDATE loan_core_views SET stale=0,synced_at=?", [
      harness.now + 500,
    ]);
    expect(harness.row(db, "loan_core_views")).toMatchObject({ stale: 1 });
    harness.outcome(db, "confirmed", harness.result, 1);
    expect(harness.row(db, "loan_repayment_requests")).toMatchObject({
      status: "paid",
      version: 4,
    });
    expect(harness.row(db, "loan_core_views")).toMatchObject({ stale: 0 });
    db.run(
      "UPDATE financial_snapshots SET synced_at=?,invalidated_at=0 WHERE bank_id='loan-test-bank'",
      [harness.now + 2000],
    );
    expect(harness.row(db, "financial_snapshots")).toMatchObject({
      invalidated_at: 0,
    });
    freshCash();
    db.run(
      "UPDATE commands SET status='executing',approver='approver' WHERE id='later-cash'",
    );
  }
});

test("confirmation rejects swapped original evidence and atomic failures preserve the reservation, history and old Core view", () => {
  const db = harness.harness();
  harness.prepare(db);
  harness.reserve(db);
  const changed = [
    { operation_id: crypto.randomUUID() },
    { amount_minor: 90000 },
    { date: "2026-10-18" },
    { savings_transaction_id: 0 },
    { transfer_id: 93 },
    { loan: { ...harness.result.loan, id: 72 } },
    {
      loan: {
        ...harness.result.loan,
        owner: { ...harness.result.loan.owner, client_id: 61 },
      },
    },
    {
      loan: {
        ...harness.result.loan,
        statement: { ...harness.result.loan.statement, transactions: [] },
      },
    },
    {
      loan: {
        ...harness.result.loan,
        statement: {
          ...harness.result.loan.statement,
          transactions: harness.result.loan.statement?.transactions.map(
            (t) => ({
              ...t,
              manually_reversed: true,
            }),
          ),
        },
      },
    },
    {
      loan: {
        ...harness.result.loan,
        statement: {
          ...harness.result.loan.statement,
          transactions: [
            ...(harness.result.loan.statement?.transactions ?? []),
            harness.result.loan.statement?.transactions.at(-1),
          ],
        },
      },
    },
  ];
  for (const invalid of changed) {
    expect(() =>
      harness.outcome(db, "confirmed", { ...harness.result, ...invalid }),
    ).toThrow();
    expect(harness.row(db, "loan_repayment_operations")).toMatchObject({
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
        [harness.operationId],
      ),
    ).toThrow();
  db.exec(
    "CREATE TRIGGER injected_repayment_history BEFORE INSERT ON loan_repayment_events WHEN NEW.kind='outcome' BEGIN SELECT RAISE(ABORT,'Injected history failure'); END",
  );
  expect(() => harness.outcome(db, "confirmed", harness.result)).toThrow();
  expect(harness.row(db, "core_write_claims")).toMatchObject({
    status: "executing",
    version: 0,
  });
  expect(harness.row(db, "loan_repayment_requests")).toMatchObject({
    status: "recommended",
    version: 2,
  });
  expect(harness.row(db, "loan_core_views")).toMatchObject({ stale: 1 });
  db.exec("DROP TRIGGER injected_repayment_history");
  harness.outcome(db, "confirmed", harness.result);
  expect(() => harness.outcome(db, "uncertain", null, 1)).toThrow();
});

test("cancellation and definite failure retain immutable consent and allow separately reviewed later attempts only", () => {
  const db = harness.harness();
  harness.offer(db);
  harness.submit(db);
  expect(() => harness.decision(db, "cancel", "officer")).toThrow();
  harness.decision(db, "cancel", "customer");
  expect(() => harness.reserve(db)).toThrow();
  expect(harness.row(db, "loan_repayment_requests")).toMatchObject({
    status: "cancelled",
  });
  expect(() =>
    db.run(
      "UPDATE loan_repayment_requests SET status='submitted',version=version+1",
    ),
  ).toThrow();
  const second = harness.harness();
  harness.prepare(second);
  harness.reserve(second);
  harness.outcome(second, "failed");
  expect(harness.row(second, "core_write_claims")).toMatchObject({
    status: "failed",
  });
  expect(() =>
    harness.reserve(second, {
      id: crypto.randomUUID(),
      client_key: "new-attempt-key",
    }),
  ).toThrow();
  const id = crypto.randomUUID();
  const retry = {
    ...harness.command,
    operation_id: id,
    key: `of-loan-repay-op-${id}`,
  };
  harness.reserve(second, {
    id,
    client_key: "new-attempt-key",
    original_version: 3,
    request_json: JSON.stringify({ ...harness.request, version: 3 }),
    command_json: JSON.stringify(retry),
    started_at: harness.now + 1000,
    observed_at: harness.now + 1000,
  });
  expect(
    second
      .query("SELECT status FROM loan_repayment_operations ORDER BY rowid")
      .all(),
  ).toEqual([{ status: "failed" }, { status: "executing" }]);
});
