import { expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { Core } from "../../../src/platform/banking-workspace/domain/ports";
import {
  actCashCount,
  declareCashCount,
  readCashCount,
  readCashCountForKey,
  readCashCounts,
} from "../../../src/platform/branch-operations/application/cash-counts";
import {
  CashCountDetail,
  CashCountInput,
  cashDenominations,
  declaredCashTotal,
} from "../../../src/platform/branch-operations/domain/cash-counts";
import { branchRoutes } from "../../../src/runtime/http/routes/branch-routes";
import { createHarness } from "../../customers/customer-banking.harness";

const harness = createHarness();
const quantities = (n = 8) =>
  cashDenominations.map((denominationMinor, i) => ({
    denominationMinor,
    quantity: i === 0 ? n : 0,
  }));
const input = (): CashCountInput => ({
  boxType: "teller",
  label: "Synthetic teller A",
  countDate: "2026-01-01",
  quantities: quantities(),
  note: "Declared for demo",
});
const setup = async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const },
    approver = { ...source, role: "approver" as const };
  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      Effect.Effect.Context<ReturnType<typeof branchRoutes>>
    >,
  ) =>
    harness.run(
      h,
      effect.pipe(
        Effect.provide(
          Layer.succeed(Core, {
            request: () => Effect.die("Cash counts must never call Core"),
          }),
        ),
      ),
    );
  const declare = (key = "declare-original", value = input()) =>
    run(declareCashCount(officer, recipientId, value, key));
  return { h, source, recipientId, officer, approver, run, declare };
};

test("all denomination quantities are explicit; zero is valid and missing, duplicate, fractional or excessive values are rejected", () => {
  expect(declaredCashTotal(quantities(0))).toBe(0);
  expect(declaredCashTotal(quantities())).toBe(400000);
  for (const rows of [
    quantities().slice(1),
    [...quantities().slice(1), quantities()[1]],
    quantities().map((r) => ({ ...r, quantity: -1 })),
    quantities().map((r) => ({ ...r, quantity: 0.5 })),
    quantities().map((r) => ({ ...r, quantity: 1000001 })),
  ])
    expect(declaredCashTotal(rows)).toBeNull();
  expect(
    Schema.is(CashCountInput)({ ...input(), countDate: "2026-02-29" }),
  ).toBe(false);
});

test("declare, return, corrected resubmission and separate review retain immutable identity and original command evidence", async () => {
  const f = await setup();
  const first = await f.declare();
  expect(first.record).toMatchObject({
    version: 1,
    status: "submitted",
    snapshot: {
      totalMinor: 400000,
      source: "synthetic_declaration",
      currency: "INR",
    },
  });
  const id = first.record.countId;
  const act = (
    role: typeof f.officer | typeof f.approver,
    command: Parameters<typeof actCashCount>[2],
    key: string,
  ) => f.run(actCashCount(role, f.recipientId, command, key));
  await expect(
    act(
      f.officer,
      { id, version: 1, action: "review", note: "Self review" },
      "self-review-key",
    ),
  ).rejects.toThrow("approver");
  const returned = await act(
    f.approver,
    { id, version: 1, action: "return", note: "Recount requested" },
    "return-original",
  );
  expect(returned.actions).toEqual([]);
  expect(
    (await f.run(readCashCount(f.officer, f.recipientId, id))).actions,
  ).toEqual(["resubmit", "withdraw"]);
  await act(
    f.officer,
    {
      id,
      version: 2,
      action: "resubmit",
      note: "Explicit zero count",
      quantities: quantities(0),
    },
    "resubmit-original",
  );
  const reviewed = await act(
    f.approver,
    { id, version: 3, action: "review", note: "Reviewed declaration only" },
    "review-original",
  );
  expect(reviewed.record.snapshot.totalMinor).toBe(0);
  expect(reviewed.actions).toEqual([]);
  expect(reviewed.history.map((e) => e.status)).toEqual([
    "submitted",
    "returned",
    "submitted",
    "reviewed",
  ]);
  const replay = await f.declare();
  expect(replay.confirmedEvent?.version).toBe(1);
  expect(replay.record.version).toBe(4);
  expect(replay.history[0].snapshot.totalMinor).toBe(400000);
  expect(JSON.stringify(replay)).not.toContain("requestJson");
  expect(JSON.stringify(replay)).not.toContain("expectedVersion");
  expect(
    (
      await f.run(
        readCashCountForKey(f.officer, f.recipientId, "return-original"),
      )
    ).confirmedEvent?.version,
  ).toBe(2);
  await expect(
    act(
      f.officer,
      { id, version: 4, action: "withdraw", note: "Too late" },
      "withdraw-late",
    ),
  ).rejects.toThrow("state or version");
});

test("original keys bind payload and actor; simultaneous stale decisions produce one event", async () => {
  const f = await setup();
  const first = await f.declare();
  await expect(
    f.declare("declare-original", { ...input(), label: "Different" }),
  ).rejects.toThrow("different details");
  const id = first.record.countId;
  const results = await Promise.allSettled(
    ["review", "return"].map((action) =>
      f.run(
        actCashCount(
          f.approver,
          f.recipientId,
          {
            id,
            version: 1,
            action: action as "review" | "return",
            note: "Concurrent",
          },
          `concurrent-${action}`,
        ),
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const current = await f.run(readCashCount(f.officer, f.recipientId, id));
  expect(current.history).toHaveLength(2);
  await expect(
    f.run(
      actCashCount(
        f.officer,
        f.recipientId,
        { id, version: 1, action: "withdraw", note: "Reuse" },
        "declare-original",
      ),
    ),
  ).rejects.toThrow("different details");
});

test("customer, foreign anchor, future dates and blank notes fail before any declaration", async () => {
  const f = await setup();
  await expect(
    f.run(declareCashCount(f.source, f.recipientId, input(), "customer-count")),
  ).rejects.toThrow("staff");
  await expect(
    f.run(declareCashCount(f.officer, "foreign", input(), "foreign-count")),
  ).rejects.toThrow("outside this branch");
  await expect(
    f.declare("future-count", { ...input(), countDate: "2999-01-01" }),
  ).rejects.toThrow("future");
  await expect(
    f.declare("blank-note-count", { ...input(), note: "   " }),
  ).rejects.toThrow("required");
  expect(
    (await f.run(readCashCounts(f.officer, f.recipientId))).records,
  ).toEqual([]);
});

test("SQL prevents editing/deleting event history and rejects forged quantities and review snapshots", async () => {
  const f = await setup();
  const first = await f.declare();
  expect(() =>
    f.h.db.run("UPDATE branch_cash_count_events SET note='changed'"),
  ).toThrow("immutable");
  expect(() => f.h.db.run("DELETE FROM branch_cash_count_events")).toThrow(
    "cannot be reset",
  );
  const row = f.h.db
    .query("SELECT * FROM branch_cash_count_events LIMIT 1")
    .get() as Record<string, unknown>;
  const insert = (changes: Record<string, unknown>) => {
    const next = {
      ...row,
      id: crypto.randomUUID(),
      command_key: crypto.randomUUID(),
      ...changes,
    };
    const keys = Object.keys(next);
    f.h.db.run(
      `INSERT INTO branch_cash_count_events(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
      Object.values(next) as string[],
    );
  };
  const command = {
    id: first.record.countId,
    version: 1,
    action: "review",
    note: "Forged",
  };
  expect(() =>
    insert({
      actor: "approver",
      action: "review",
      expected_version: 1,
      version: 2,
      status: "reviewed",
      note: "Forged",
      request_json: JSON.stringify({ actor: "approver", command }),
      snapshot_json: JSON.stringify({
        ...first.record.snapshot,
        totalMinor: 1,
      }),
    }),
  ).toThrow("total");
  expect(() =>
    insert({
      count_id: "other-count",
      request_json: JSON.stringify({
        actor: "officer",
        command: { action: "declare", version: 0, ...input(), label: "wrong" },
      }),
    }),
  ).toThrow("identity");
});

test("route rejects excess command properties and ambiguous recovery selectors", async () => {
  const f = await setup();
  const response = await f.run(
    branchRoutes(
      new Request("https://example.test/api/branch/cash-counts", {
        method: "POST",
        body: JSON.stringify({
          customerId: f.recipientId,
          key: "route-original",
          command: { ...input(), totalMinor: 0 },
        }),
      }),
      f.officer,
    ).pipe(Effect.flip),
  );
  expect(response).toMatchObject({ status: 400 });
  expect(
    await f.run(
      branchRoutes(
        new Request(
          `https://example.test/api/branch/cash-counts?customerId=${f.recipientId}&id=x&key=y`,
        ),
        f.officer,
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
  const first = await f.declare();
  expect(
    Schema.is(CashCountDetail)({
      ...first,
      history: [{ ...first.history[0], status: "reviewed" }],
    }),
  ).toBe(false);
});
