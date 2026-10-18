import { afterEach, expect, test } from "bun:test";
import { Clock, Effect } from "effect";
import {
  createCommand,
  dashboard,
  executeCommand,
} from "../src/application/banking";
import { runPayeeAdmin } from "../src/application/customer-payee-admin";
import {
  confirmPayee,
  removePayee,
  reviewPayee,
  savedPayees,
} from "../src/application/customer-payees";
import {
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../src/application/customer-provisioning";
import {
  registerCustomer,
  registeredCustomer,
} from "../src/application/customer-registry";
import {
  confirmCustomerTransfer,
  inspectCustomerTransfer,
  reviewCustomerTransfer,
} from "../src/application/customer-transfers";
import { verifyWorkflowDump } from "../src/cli/workflow-release";
import { BankingError, type Session } from "../src/domain/banking";
import { Store } from "../src/domain/ports";
import { customerHarness } from "./fixtures/customer-banking";

const fixtures: ReturnType<typeof customerHarness>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.db.close();
});
const session = (bank_id = "branch"): Session => ({
  bank_id,
  token_hash: `token-${bank_id}`,
  role: "customer",
  expires_at: Date.now() + 600000,
});
const setup = async (count = 1) => {
  const h = customerHarness();
  fixtures.push(h);
  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | Effect.Effect.Context<ReturnType<typeof reviewCustomerTransfer>>
      | Effect.Effect.Context<ReturnType<typeof resumeCustomerSeed>>
    >,
  ) => Effect.runPromise(effect.pipe(Effect.provide(h.layer)));
  await run(prepareCustomerManifest("branch"));
  for (let start = 1; start <= count; start += 10)
    await run(
      resumeCustomerSeed("branch", start, Math.min(10, count - start + 1)),
    );
  return { h, run };
};
const command = {
  action: "status" as const,
  branchId: "branch",
  start: 1,
  limit: 10,
};

test("known name/account review, explicit confirmation and removal are owner-bound metadata, never Core calls", async () => {
  const { h, run } = await setup();
  const recipient = await run(registeredCustomer("sample-branch-001"));
  const before = h.calls.length;
  expect((await run(savedPayees(session()))).count).toBe(0);
  for (const [name, account] of [
    [recipient.display_name, "unknown"],
    ["Wrong holder", recipient.account_no],
    ["Mira Krishnan", "SYN00000011"],
  ])
    expect(
      await run(reviewPayee(session(), name, account).pipe(Effect.flip)),
    ).toMatchObject({ status: 400 });
  const review = await run(
    reviewPayee(session(), recipient.display_name, recipient.account_no),
  );
  expect((await run(savedPayees(session()))).count).toBe(0);
  expect(
    await run(
      confirmPayee(session(recipient.bank_id), review.review_id).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  const added = await run(confirmPayee(session(), review.review_id));
  expect(added.payees[0]).toMatchObject({
    display_name: recipient.display_name,
    account_suffix: recipient.account_no.slice(-4),
  });
  expect((await run(savedPayees(session(recipient.bank_id)))).count).toBe(0);
  expect(
    await run(
      removePayee(session(recipient.bank_id), added.payees[0].id).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  await run(removePayee(session(), added.payees[0].id));
  expect((await run(confirmPayee(session(), review.review_id))).count).toBe(0);
  const again = await run(
    reviewPayee(session(), recipient.display_name, recipient.account_no),
  );
  expect(
    (await run(confirmPayee(session(), again.review_id))).payees[0].id,
  ).toBe(added.payees[0].id);
  expect(h.calls.length).toBe(before);
  expect(() => h.db.run("DELETE FROM customer_payees")).toThrow();
});

test("unregistered/self/cross-branch/disabled and expired payee reviews cannot add or leak transfer availability", async () => {
  const { h, run } = await setup();
  await run(
    registerCustomer({
      id: "foreign",
      branch_id: "other",
      bank_id: "other",
      reference: "FOREIGN",
      display_name: "Foreign Customer",
      client_id: 4,
      account_id: 14,
      account_no: "SYN00000014",
      origin: "legacy",
    }),
  );
  const r = await run(registeredCustomer("sample-branch-001"));
  const before = h.calls.length;
  expect(
    await run(
      reviewPayee(session(), "Foreign Customer", "SYN00000014").pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await run(
      reviewPayee(session(), "Mira Krishnan", "SYN00000011").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
  expect(
    await run(reviewCustomerTransfer(session(), r.id, "1").pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  const review = await run(
    reviewPayee(session(), r.display_name, r.account_no),
  );
  h.db.run("UPDATE customers SET status='disabled' WHERE id=?", [r.id]);
  expect(
    await run(confirmPayee(session(), review.review_id).pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  expect(h.calls.length).toBe(before);
  h.db.run("UPDATE customers SET status='active' WHERE id=?", [r.id]);
  // Clock injection exercises expiry without weakening immutable review storage.
  const expired = await Effect.runPromise(
    reviewPayee(session(), r.display_name, r.account_no).pipe(
      Effect.provide(h.layer),
      Effect.withClock({
        ...Clock.make(),
        currentTimeMillis: Effect.succeed(0),
        unsafeCurrentTimeMillis: () => 0,
        currentTimeNanos: Effect.succeed(0n),
        unsafeCurrentTimeNanos: () => 0n,
        sleep: () => Effect.void,
      }),
    ),
  );
  expect(
    await run(confirmPayee(session(), expired.review_id).pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
});

test("removed or re-added payee invalidates NEW confirmation; original-key inspection survives removal and never reposts", async () => {
  const { h, run } = await setup();
  const r = await run(registeredCustomer("sample-branch-001"));
  const review = await run(
    reviewPayee(session(), r.display_name, r.account_no),
  );
  const added = await run(confirmPayee(session(), review.review_id));
  const first = await run(reviewCustomerTransfer(session(), r.id, "12.34"));
  const second = await run(reviewCustomerTransfer(session(), r.id, "1"));
  await run(removePayee(session(), added.payees[0].id));
  const calls = h.calls.length;
  const declined = await run(
    confirmCustomerTransfer(session(), first.offer.id, "removed-original-key"),
  );
  expect(declined.status).toBe("failed");
  expect(
    (await run(inspectCustomerTransfer(session(), declined.id))).status,
  ).toBe("failed");
  expect(h.calls.length).toBe(calls);
  const again = await run(reviewPayee(session(), r.display_name, r.account_no));
  await run(confirmPayee(session(), again.review_id));
  expect(
    await run(
      confirmCustomerTransfer(
        session(),
        second.offer.id,
        "readded-original-key",
      ),
    ),
  ).toMatchObject({ status: "failed" });
  const next = await run(reviewCustomerTransfer(session(), r.id, "12.34"));
  h.loseResponse("accounttransfers");
  const sent = await run(
    confirmCustomerTransfer(session(), next.offer.id, "saved-original-key"),
  );
  expect(sent.status).toBe("uncertain");
  await run(removePayee(session(), added.payees[0].id));
  expect((await run(inspectCustomerTransfer(session(), sent.id))).status).toBe(
    "posted",
  );
  expect(
    (
      await run(
        confirmCustomerTransfer(session(), next.offer.id, "saved-original-key"),
      )
    ).status,
  ).toBe("posted");
  expect(
    h.calls.filter((c) => c.method === "POST" && c.path === "accounttransfers"),
  ).toHaveLength(1);
});

test("atomic claim rejects removal after application authorization but before executing status", async () => {
  const { h, run } = await setup();
  const r = await run(registeredCustomer("sample-branch-001"));
  const reviewed = await run(
    reviewPayee(session(), r.display_name, r.account_no),
  );
  await run(confirmPayee(session(), reviewed.review_id));
  const { offer } = await run(reviewCustomerTransfer(session(), r.id, "1"));
  // Simulate the other transaction winning exactly at reservation, after all app checks.
  h.db.run(
    "CREATE TRIGGER simulate_payee_removal AFTER INSERT ON customer_transfers BEGIN UPDATE customer_payees SET status='removed',version=version+1 WHERE recipient_id='sample-branch-001'; END;",
  );
  const declined = await run(
    confirmCustomerTransfer(session(), offer.id, "atomic-removal-key"),
  );
  expect(declined.status).toBe("failed");
  expect(
    (await run(inspectCustomerTransfer(session(), declined.id))).status,
  ).toBe("failed");
  expect(h.calls.filter((c) => c.path === "accounttransfers")).toHaveLength(0);
  expect(
    h.db
      .query(
        "SELECT count(*) AS n FROM core_write_claims WHERE status='executing'",
      )
      .get(),
  ).toEqual({ n: 0 });
});

test("lost execution-claim acknowledgement cannot invent a terminal failed outcome or dispatch Core", async () => {
  const { h, run } = await setup();
  const r = await run(registeredCustomer("sample-branch-001"));
  const reviewed = await run(
    reviewPayee(session(), r.display_name, r.account_no),
  );
  await run(confirmPayee(session(), reviewed.review_id));
  const { offer } = await run(reviewCustomerTransfer(session(), r.id, "1"));
  const result = await run(
    Effect.gen(function* () {
      const store = yield* Store;
      return yield* confirmCustomerTransfer(
        session(),
        offer.id,
        "claim-acknowledgement-key",
      ).pipe(
        Effect.provideService(Store, {
          ...store,
          run: (sql, ...values) =>
            sql.startsWith("UPDATE commands SET status='executing'")
              ? store.run(sql, ...values).pipe(
                  Effect.zipRight(
                    Effect.fail(
                      new BankingError({
                        message: "Lost claim acknowledgement",
                        status: 503,
                      }),
                    ),
                  ),
                )
              : store.run(sql, ...values),
        }),
        Effect.either,
      );
    }),
  );
  expect(result._tag).toBe("Left");
  expect(h.calls.filter((c) => c.path === "accounttransfers")).toHaveLength(0);
  const original = h.db
    .query<{ id: string; status: string }, []>(
      "SELECT id,status FROM commands WHERE key='claim-acknowledgement-key'",
    )
    .get();
  if (!original) throw new Error("Missing original claim");
  expect(original.status).toBe("executing");
  expect(
    (await run(inspectCustomerTransfer(session(), original.id))).status,
  ).toBe("uncertain");
});

test("frozen 101-customer bounded setup gives 5-15 each; repeat preserves removals, balances and histories", async () => {
  const { h, run } = await setup(99);
  await run(
    registerCustomer({
      id: "opened-155",
      branch_id: "branch",
      bank_id: "other",
      reference: "OPENED-155",
      display_name: "New Account Holder",
      client_id: 4,
      account_id: 14,
      account_no: "SYN00000014",
      origin: "onboarding",
    }),
  );
  const originalAccounts = JSON.stringify([...h.accounts]);
  const originalDocuments = h.db.query("SELECT * FROM documents").all();
  const before = h.calls.length;
  const initial = await run(runPayeeAdmin({ ...command, action: "prepare" }));
  expect(initial.summary?.owners).toBe(101);
  for (let start = 1; start <= 101; start += 10) {
    const result = await run(
      runPayeeAdmin({ ...command, action: "resume", start }),
    );
    expect(result.progress.ownersCompleted).toBeLessThanOrEqual(10);
    expect(result.progress.membershipsAdded).toBeLessThanOrEqual(150);
  }
  const counts = h.db
    .query<{ n: number }, []>(
      "SELECT count(*) AS n FROM customer_payees WHERE status='active' GROUP BY owner_id",
    )
    .all()
    .map((r) => r.n);
  expect(counts).toHaveLength(101);
  expect(Math.min(...counts)).toBe(5);
  expect(Math.max(...counts)).toBe(15);
  const original = (await run(savedPayees(session()))).payees[0];
  await run(removePayee(session(), original.id));
  await run(runPayeeAdmin({ ...command, action: "prepare" }));
  for (let start = 1; start <= 101; start += 10)
    expect(
      (await run(runPayeeAdmin({ ...command, action: "resume", start })))
        .progress,
    ).toEqual({ membershipsAdded: 0, ownersCompleted: 0 });
  expect(
    (await run(savedPayees(session()))).payees.some(
      (p) => p.id === original.id,
    ),
  ).toBe(false);
  expect(h.calls.length).toBe(before);
  expect(JSON.stringify([...h.accounts])).toBe(originalAccounts);
  expect(h.db.query("SELECT * FROM documents").all()).toEqual(
    originalDocuments,
  );
  expect(() =>
    h.db.run("UPDATE customer_payee_seed_rosters SET customer_ids='[]'"),
  ).toThrow();
});

test("future onboarding after the frozen snapshot starts empty and setup rerun never adds it", async () => {
  const { h, run } = await setup(9);
  await run(runPayeeAdmin({ ...command, action: "prepare" }));
  await run(
    registerCustomer({
      id: "future-opened",
      branch_id: "branch",
      bank_id: "other",
      reference: "FUTURE-OPENED",
      display_name: "Future Account Holder",
      client_id: 4,
      account_id: 14,
      account_no: "SYN00000014",
      origin: "onboarding",
    }),
  );
  const before = h.calls.length;
  expect((await run(savedPayees(session("other")))).count).toBe(0);
  await run(runPayeeAdmin({ ...command, action: "prepare" }));
  await run(runPayeeAdmin({ ...command, action: "resume" }));
  expect((await run(runPayeeAdmin(command))).summary).toMatchObject({
    frozen_owners: 10,
    owners: 10,
    complete: 10,
  });
  expect((await run(savedPayees(session("other")))).count).toBe(0);
  expect(h.calls.length).toBe(before);
});

test("demo safety ceiling 50 is atomic for concurrent additions while initial fixture range stays 5-15", async () => {
  const { h, run } = await setup(60);
  const rows = h.db
    .query<{ display_name: string; account_no: string }, []>(
      "SELECT display_name,account_no FROM customers WHERE id<>'legacy-branch' ORDER BY id LIMIT 51",
    )
    .all();
  const reviews = [];
  for (const r of rows)
    reviews.push(
      await run(reviewPayee(session(), r.display_name, r.account_no)),
    );
  for (const review of reviews.slice(0, 49))
    await run(confirmPayee(session(), review.review_id));
  const results = await Promise.all(
    reviews
      .slice(49)
      .map((r) =>
        run(confirmPayee(session(), r.review_id).pipe(Effect.either)),
      ),
  );
  expect(results.filter((r) => r._tag === "Right")).toHaveLength(1);
  expect((await run(savedPayees(session()))).count).toBe(50);
});

test("backup guard requires every payee table, trigger and offer binding column", async () => {
  const paths: string[] = [];
  for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
    paths.push(path);
  const complete = (
    await Promise.all(paths.sort().map((path) => Bun.file(path).text()))
  ).join("\n");
  await Effect.runPromise(verifyWorkflowDump(complete));
  for (const name of [
    "customer_transfer_payee_execution",
    "customer_payee_review_confirm",
    "customer_payee_seed_guard",
    "customer_legacy_transfer_insert",
    "customer_legacy_transfer_execution",
  ])
    expect(
      await Effect.runPromise(
        verifyWorkflowDump(`${complete}\nDROP TRIGGER ${name};`).pipe(
          Effect.flip,
        ),
      ),
    ).toMatchObject({ message: expect.stringContaining("did not restore") });
});

test("registered customer cannot bypass saved payees through legacy transfer creation or pending execution; staff policy and historical rows survive", async () => {
  const h = customerHarness();
  fixtures.push(h);
  h.db.run(
    "INSERT INTO beneficiaries(id,bank_id,name,account_id,account_no,status) VALUES('legacy-payee','branch','Arjun Raman',12,'SYN00000012','active')",
  );
  for (const [id, status, maker] of [
    ["old-customer-pending", "pending", "customer"],
    ["old-customer-posted", "posted", "customer"],
    ["staff-payment", "pending", "officer"],
  ])
    h.db.run(
      'INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id,payload) VALUES(?,\'branch\',?,\'transfer\',?,100,\'Original legacy transfer\',?,11,\'{"kind":"transfer","amount":1,"beneficiaryId":"legacy-payee"}\')',
      [id, id, status, maker],
    );
  const run = <A, E>(
    effect: Effect.Effect<
      A,
      E,
      Effect.Effect.Context<ReturnType<typeof createCommand>>
    >,
  ) => Effect.runPromise(effect.pipe(Effect.provide(h.layer)));
  await run(prepareCustomerManifest("branch"));
  const before = h.calls.filter((c) => c.method === "POST").length;
  expect(
    (
      await run(
        createCommand(
          session(),
          { kind: "transfer", amount: 1, beneficiaryId: "legacy-payee" },
          "legacy-customer-bypass",
        ).pipe(Effect.either),
      )
    )._tag,
  ).toBe("Left");
  expect(
    (
      await run(
        executeCommand(
          { ...session(), role: "approver" },
          "old-customer-pending",
        ).pipe(Effect.either),
      )
    )._tag,
  ).toBe("Left");
  expect(
    (await run(executeCommand(session(), "old-customer-posted"))).status,
  ).toBe("posted");
  expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(before);
  expect(
    (
      await run(
        executeCommand({ ...session(), role: "approver" }, "staff-payment"),
      )
    ).status,
  ).toBe("posted");
  expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(before + 1);
  const view = await run(dashboard(session()));
  expect(view.commands.map((c) => c.id)).toEqual(
    expect.arrayContaining([
      "old-customer-pending",
      "old-customer-posted",
      "staff-payment",
    ]),
  );
  expect(view.beneficiaries).toMatchObject([
    { id: "legacy-payee", status: "active" },
  ]);
});

test("interrupted preparation cannot report complete; original frozen roster resumes without replacement, invalid recipient remains blocked", async () => {
  const { h, run } = await setup(9);
  let attempts = 0;
  const interrupted = await run(
    Effect.gen(function* () {
      const store = yield* Store;
      return yield* runPayeeAdmin({ ...command, action: "prepare" }).pipe(
        Effect.provideService(Store, {
          ...store,
          run: (sql, ...values) =>
            sql.startsWith("INSERT INTO customer_payee_seed_owners") &&
            ++attempts === 4
              ? Effect.fail(
                  new BankingError({
                    message: "fixture interruption",
                    status: 503,
                  }),
                )
              : store.run(sql, ...values),
        }),
        Effect.either,
      );
    }),
  );
  expect(interrupted._tag).toBe("Left");
  const partial = await run(runPayeeAdmin(command));
  expect(partial.summary).toMatchObject({
    frozen_owners: 10,
    owners: 3,
    complete: 0,
    preparation_complete: false,
    setup_complete: false,
  });
  expect(
    await run(
      runPayeeAdmin({ ...command, action: "resume" }).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  await run(runPayeeAdmin({ ...command, action: "prepare" }));
  const first = h.db
    .query<{ recipient_ids: string }, []>(
      "SELECT recipient_ids FROM customer_payee_seed_owners WHERE ordinal=1",
    )
    .get();
  if (!first) throw new Error("missing frozen plan");
  const recipient = (JSON.parse(first.recipient_ids) as string[])[0];
  h.db.run("UPDATE customers SET status='disabled' WHERE id=?", [recipient]);
  expect(
    await run(
      runPayeeAdmin({ ...command, action: "resume", limit: 1 }).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 409 });
  expect((await run(runPayeeAdmin(command))).summary.complete).toBe(0);
  h.db.run("UPDATE customers SET status='active' WHERE id=?", [recipient]);
  await Promise.all([
    run(runPayeeAdmin({ ...command, action: "resume" })),
    run(runPayeeAdmin({ ...command, action: "resume" })),
  ]);
  expect((await run(runPayeeAdmin(command))).summary).toMatchObject({
    frozen_owners: 10,
    owners: 10,
    complete: 10,
    preparation_complete: true,
    setup_complete: true,
    min_active: 5,
    max_active: 9,
  });
});
