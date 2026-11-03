import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { Session } from "../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { readProcessing } from "../../src/platform/branch-operations/application/processing";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
const setup = async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const calls: string[] = [];
  const values: Record<string, unknown> = {
    scheduler: { active: true, secret: "private" },
    businessdate: [],
    jobs: [
      {
        jobId: 2,
        displayName: "Savings processing",
        active: true,
        currentlyRunning: false,
        nextRunTime: "Core time",
        lastRunHistory: {
          status: "success",
          jobRunStartTime: "Core start",
          errorLog: "private stack",
        },
        errorLog: "private",
      },
    ],
  };
  const layer = Layer.succeed(Core, {
    request: <T>(method: string, path: string) => {
      if (method !== "GET")
        return Effect.die("Processing enquiry dispatched a write");
      calls.push(path);
      return Effect.succeed(values[path] as T);
    },
  });
  const officer = { ...source, role: "officer" as const };
  const read = (customerId = recipientId, session: Session = officer) =>
    harness.run(
      h,
      readProcessing(session, customerId).pipe(Effect.provide(layer)),
    );
  return { h, source, officer, recipientId, calls, values, read };
};
test("processing projects only safe fields and preserves empty dates without certifying completion", async () => {
  const f = await setup();
  const evidence = await f.read();
  expect(evidence.scheduler).toEqual({ active: true });
  expect(evidence.businessDates).toEqual([]);
  expect(evidence.jobs?.[0].lastRunHistory).toEqual({
    status: "success",
    jobRunStartTime: "Core start",
  });
  expect(JSON.stringify(evidence)).not.toContain("private");
  expect(evidence.errors).toEqual([]);
  expect(f.calls.sort()).toEqual(["businessdate", "jobs", "scheduler"]);
});
test("processing checks staff and branch membership before any Core read", async () => {
  const f = await setup();
  await expect(
    f.read(f.recipientId, {
      ...f.officer,
      role: "customer",
    }),
  ).rejects.toThrow("staff");
  await expect(f.read("foreign-customer")).rejects.toThrow(
    "outside this branch",
  );
  expect(f.calls).toEqual([]);
});
test("processing withholds malformed or over-cap sources independently", async () => {
  const f = await setup();
  f.values.scheduler = { active: "true" };
  f.values.businessdate = [{ type: "BUSINESS_DATE", date: [2025, 2, 29] }];
  f.values.jobs = Array.from({ length: 501 }, (_, i) => ({
    jobId: i + 1,
    displayName: "x",
    active: true,
    currentlyRunning: false,
  }));
  const invalid = await f.read();
  expect(invalid.scheduler).toBeNull();
  expect(invalid.jobs).toBeNull();
  expect(invalid.businessDates).toBeNull();
  expect(invalid.errors).toHaveLength(3);
  f.values.jobs = [];
  f.values.businessdate = [{ type: "BUSINESS_DATE", date: [2026, 11, 3] }];
  const valid = await f.read();
  expect(valid.jobs).toEqual([]);
  expect(valid.businessDates?.[0].date).toEqual([2026, 11, 3]);
  expect(valid.scheduler).toBeNull();
});
test("duplicate job identifiers withhold the list rather than inflate counts", async () => {
  const f = await setup();
  const rows = f.values.jobs as object[];
  f.values.jobs = [rows[0], rows[0]];
  const evidence = await f.read();
  expect(evidence.jobs).toBeNull();
  expect(evidence.scheduler?.active).toBe(true);
  expect(evidence.errors).toHaveLength(1);
});

test("registered relationships in a foreign branch cannot read tenant processing metadata", async () => {
  const f = await setup();
  f.h.db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('foreign-bank','ready',999001,999002)",
  );
  f.h.db.run(
    "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [
      "foreign-id",
      "foreign-bank",
      "foreign-bank",
      "foreign-ref",
      "Synthetic foreign relationship",
      999001,
      999002,
      "999002",
      "seed",
      "active",
    ],
  );
  await expect(f.read("foreign-id")).rejects.toThrow("outside this branch");
  expect(f.calls).toEqual([]);
});
