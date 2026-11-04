import { expect, test } from "bun:test";
import { Effect } from "effect";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import { Store } from "../../../src/platform/banking-workspace/domain/ports";
import {
  actCashCount,
  declareCashCount,
  readCashCount,
  readCashCounts,
} from "../../../src/platform/branch-operations/application/cash-counts";
import { cashDenominations } from "../../../src/platform/branch-operations/domain/cash-counts";
import { createHarness } from "../../customers/customer-banking.harness";

const harness = createHarness();
const input = {
  boxType: "vault" as const,
  label: "Recovery vault",
  countDate: "2026-01-01",
  quantities: cashDenominations.map((denominationMinor) => ({
    denominationMinor,
    quantity: 0,
  })),
  note: "Declared zero, not unknown",
};
test("an insert acknowledgement loss resolves the original event without a second append", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const },
    store = await harness.run(h, Store);
  const faulty = {
    ...store,
    run: (...args: Parameters<typeof store.run>) =>
      store.run(...args).pipe(
        Effect.flatMap(() =>
          Effect.fail(
            new BankingError({
              message: "Lost acknowledgement",
              status: 503,
              uncertain: true,
            }),
          ),
        ),
      ),
  };
  const saved = await harness.run(
    h,
    declareCashCount(officer, recipientId, input, "lost-ack-count").pipe(
      Effect.provideService(Store, faulty),
    ),
  );
  expect(saved.confirmedEvent?.version).toBe(1);
  const again = await harness.run(
    h,
    declareCashCount(officer, recipientId, input, "lost-ack-count"),
  );
  expect(again.record.id).toBe(saved.record.id);
  expect(again.history).toHaveLength(1);
});
test("failed confirmation preserves uncertain outcome and retry later returns the one saved event", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const },
    store = await harness.run(h, Store);
  let wrote = false;
  const faulty = {
    ...store,
    run: (...args: Parameters<typeof store.run>) =>
      store.run(...args).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            wrote = true;
          }),
        ),
      ),
    one: <T>(...args: Parameters<typeof store.one>) =>
      wrote
        ? Effect.fail(
            new BankingError({ message: "Read unavailable", status: 503 }),
          )
        : store.one<T>(...args),
  };
  const outcome = await harness.run(
    h,
    declareCashCount(officer, recipientId, input, "unconfirmed-count").pipe(
      Effect.provideService(Store, faulty),
      Effect.flip,
    ),
  );
  expect(outcome).toMatchObject({ status: 503, uncertain: true });
  const recovered = await harness.run(
    h,
    declareCashCount(officer, recipientId, input, "unconfirmed-count"),
  );
  expect(recovered.history).toHaveLength(1);
  expect(recovered.record.status).toBe("submitted");
});
test("list capacity is explicit and does not imply the branch has no other declarations", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  for (let i = 0; i < 101; i++)
    await harness.run(
      h,
      declareCashCount(
        officer,
        recipientId,
        { ...input, label: `Vault ${i}` },
        `capacity-${i}`,
      ),
    );
  const list = await harness.run(h, readCashCounts(officer, recipientId));
  expect(list.records).toHaveLength(100);
  expect(list.limited).toBe(true);
});
test("history over 200 events exposes latest state separately and withholds every further action", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const },
    approver = { ...source, role: "approver" as const };
  let current = await harness.run(
    h,
    declareCashCount(officer, recipientId, input, "history-initial"),
  );
  for (let version = 1; version <= 200; version++)
    current = await harness.run(
      h,
      actCashCount(
        version % 2 ? approver : officer,
        recipientId,
        version % 2
          ? {
              id: current.record.countId,
              version,
              action: "return",
              note: "Review requested",
            }
          : {
              id: current.record.countId,
              version,
              action: "resubmit",
              note: "Recount declared",
              quantities: input.quantities,
            },
        `history-event-${version}`,
      ),
    );
  expect(current.record.version).toBe(201);
  expect(current.history).toHaveLength(200);
  expect(current.historyComplete).toBe(false);
  expect(current.actions).toEqual([]);
  const read = await harness.run(
    h,
    readCashCount(approver, recipientId, current.record.countId),
  );
  expect(read.actions).toEqual([]);
  expect(
    await harness.run(
      h,
      actCashCount(
        approver,
        recipientId,
        {
          id: read.record.countId,
          version: 201,
          action: "review",
          note: "Not allowed",
        },
        "history-blocked",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 503 });
}, 20000);
