import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { Store } from "../../../src/platform/banking-workspace/domain/ports";
import { readLoanPostingEvidence } from "../../../src/platform/lending/application/loan-posting-evidence";
import { createHarness } from "./loan-origination.harness";

const harness = createHarness();
const active = async () =>
  harness.act(await harness.approved(), "disburse", harness.approver);
test("posting evidence validates original disbursement/native transaction and projects history without writes or private budget", async () => {
  const loan = await active();
  const before = harness.dispatches.length,
    reads = harness.coreReads.length;
  const evidence = await harness.run(
    readLoanPostingEvidence(harness.officer, loan.loan.core_id ?? 0, 41, 51),
  );
  expect(evidence.errors).toEqual([]);
  expect(evidence.applicationId).toBe(loan.loan.id);
  expect(evidence.receipts).toHaveLength(1);
  expect(evidence.receipts[0]).toMatchObject({
    kind: "disbursement",
    transactionId: 81,
    actor: "approver",
    historyComplete: true,
  });
  expect(evidence.receipts[0].history).toHaveLength(8);
  expect(JSON.stringify(evidence)).not.toContain("monthly_income");
  expect(harness.dispatches).toHaveLength(before);
  expect(harness.coreReads).toHaveLength(reads);
});
test("posting evidence rejects customer role and never returns another client/bank receipt", async () => {
  const loan = await active();
  await expect(
    harness.run(
      readLoanPostingEvidence(harness.customer, loan.loan.core_id ?? 0, 41, 51),
    ),
  ).rejects.toThrow("staff");
  expect(
    (
      await harness.run(
        readLoanPostingEvidence(
          harness.officer,
          loan.loan.core_id ?? 0,
          999,
          51,
        ),
      )
    ).receipts,
  ).toEqual([]);
  expect(
    (
      await harness.run(
        readLoanPostingEvidence(
          { ...harness.officer, bank_id: "foreign" },
          loan.loan.core_id ?? 0,
          41,
          51,
        ),
      )
    ).receipts,
  ).toEqual([]);
});
for (const field of ["transaction", "owner", "request", "status"] as const) {
  test(`corrupted ${field} posting evidence never creates a receipt link`, async () => {
    const loan = await active();
    const layer = Layer.succeed(Store, {
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => {
          const rows = harness.db.query(sql).all(...values);
          if (
            sql.includes("FROM loan_operations") &&
            sql.includes("result_json")
          )
            for (const raw of rows) {
              const row = raw as {
                result_json: string;
                command_json: string;
                request_json: string;
                status: string;
              };
              if (field === "transaction") {
                const value = JSON.parse(row.result_json);
                value.transaction_id = 999999;
                row.result_json = JSON.stringify(value);
              }
              if (field === "owner") {
                const value = JSON.parse(row.command_json);
                value.owner.client_id = 999999;
                row.command_json = JSON.stringify(value);
              }
              if (field === "request") {
                const value = JSON.parse(row.request_json);
                value.note = "Different original note";
                row.request_json = JSON.stringify(value);
              }
              if (field === "status") row.status = "uncertain";
            }
          return rows as T[];
        }),
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => harness.db.query(sql).get(...values) as T | null),
      run: () => Effect.die("Read-only provenance attempted persistence"),
    });
    const evidence = await harness.run(
      readLoanPostingEvidence(
        harness.officer,
        loan.loan.core_id ?? 0,
        41,
        51,
      ).pipe(Effect.provide(layer)),
    );
    expect(evidence.receipts).toEqual([]);
    expect(evidence.errors).toHaveLength(1);
  });
}
