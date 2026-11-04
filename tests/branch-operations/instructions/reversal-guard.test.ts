import { expect, test } from "bun:test";
import { Effect, Either, Layer } from "effect";
import {
  createCommand,
  executeCommand,
} from "../../../src/platform/banking-workspace/application/banking";
import type { BankingCommand } from "../../../src/platform/banking-workspace/domain/banking";
import { Store } from "../../../src/platform/banking-workspace/domain/ports";
import { createHarness } from "../../customers/customer-banking.harness";

const harness = createHarness();
test("existing database guard admits only one live reversal when distinct keys race past the prior-history read", async () => {
  const { h, source } = await harness.twoCustomers(),
    officer = { ...source, role: "officer" as const },
    checker = { ...source, role: "approver" as const };
  const original = await harness.run(
    h,
    createCommand(
      officer,
      {
        kind: "deposit",
        amount: 1.25,
        description: "Synthetic fixture original cash",
      },
      "reversal-guard-original",
    ),
  );
  await harness.run(h, executeCommand(checker, original.id));
  const store = await harness.run(h, Store);
  const before = await store
    .all("SELECT id FROM commands")
    .pipe(Effect.runPromise);
  let arrivals = 0;
  const release = Promise.withResolvers<void>();
  const concurrent = Layer.succeed(Store, {
    ...store,
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      sql.includes("json_extract(payload,'$.originalId')")
        ? Effect.gen(function* () {
            arrivals++;
            if (arrivals === 2) release.resolve();
            yield* Effect.promise(() => release.promise);
            return null as T | null;
          })
        : store.one<T>(sql, ...values),
  });
  const input = {
    kind: "reverse" as const,
    originalId: original.id,
    description: "Synthetic fixture reversal request",
  };
  const results = await Promise.all(
    ["reversal-distinct-key-a", "reversal-distinct-key-b"].map((key) =>
      harness.run(
        h,
        createCommand(officer, input, key).pipe(
          Effect.provide(concurrent),
          Effect.either,
        ),
      ),
    ),
  );
  const winners = results.filter(Either.isRight);
  const conflicts = results.filter(Either.isLeft);
  expect(winners).toHaveLength(1);
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].left).toMatchObject({ status: 409 });
  expect(winners[0].right.status).toBe("pending");
  const rows = await store
    .all<BankingCommand>("SELECT * FROM commands WHERE kind='reverse'")
    .pipe(Effect.runPromise);
  expect(rows).toHaveLength(1);
  expect(
    (await store.all("SELECT id FROM commands").pipe(Effect.runPromise)).length,
  ).toBe(before.length + 1);
  const repeated = await harness.run(
    h,
    createCommand(officer, input, winners[0].right.key),
  );
  expect(repeated.id).toBe(winners[0].right.id);
  expect(repeated.status).toBe("pending");
});
