import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
  createCommand,
  dashboard,
  executeCommand,
} from "../src/application/banking";
import { runCustomerAdmin } from "../src/application/customer-admin";
import {
  customerSeedStatus,
  inspectCustomerSeed,
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../src/application/customer-provisioning";
import {
  assertApplicantScope,
  createApplicantScope,
  customerDirectory,
  registerCustomer,
  registeredCustomer,
  registerOpenedCustomer,
  selectCustomerScope,
} from "../src/application/customer-registry";
import {
  confirmCustomerTransfer,
  customerTransferHistory,
  inspectCustomerTransfer,
  reviewCustomerTransfer,
} from "../src/application/customer-transfers";
import type { Session } from "../src/domain/banking";
import type { CustomerProvisionerService } from "../src/domain/customer-provisioning";
import { Core } from "../src/domain/ports";
import { customerHarness } from "./fixtures/customer-banking";

const harnesses: ReturnType<typeof customerHarness>[] = [];
const setup = () => {
  const h = customerHarness();
  harnesses.push(h);
  return h;
};
afterEach(() => {
  for (const h of harnesses.splice(0)) h.db.close();
});
const session = (bank = "branch"): Session => ({
  token_hash: `session-${bank}`,
  bank_id: bank,
  role: "customer",
  expires_at: Date.now() + 600000,
});
const run = <A, E>(
  h: ReturnType<typeof customerHarness>,
  effect: Effect.Effect<
    A,
    E,
    | Effect.Effect.Context<ReturnType<typeof prepareCustomerManifest>>
    | CustomerProvisionerService
    | import("../src/domain/customer-transfers").CustomerTransferService
  >,
) => Effect.runPromise(effect.pipe(Effect.provide(h.layer)));

test("100 durable unique synthetic customers own distinct Core clients/accounts; repeat does not fund or reset", async () => {
  const h = setup();
  await run(h, prepareCustomerManifest("branch"));
  for (let start = 1; start <= 100; start += 10)
    await run(h, resumeCustomerSeed("branch", start, 10));
  const first = await run(h, customerSeedStatus("branch"));
  expect(first.registered?.count).toBe(99);
  expect(new Set(first.customers.map((row) => row.account_id)).size).toBe(99);
  expect(new Set(first.customers.map((row) => row.client_id)).size).toBe(99);
  expect(h.clients.size).toBe(103);
  expect(h.accounts.size).toBe(103);
  const originalAccount = first.customers[0].account_id ?? 0;
  const account = h.accounts.get(originalAccount);
  if (!account) throw new Error("Fixture missing provisioned account");
  account.summary.accountBalance = account.summary.availableBalance = 123.45;
  const writes = h.calls.filter((call) => call.method === "POST").length;
  await run(h, prepareCustomerManifest("branch"));
  await run(h, resumeCustomerSeed("branch", 1, 10));
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(writes);
  expect(account.summary.accountBalance).toBe(123.45);
  expect(
    h.db.query("SELECT customer_account FROM banks WHERE id='branch'").get(),
  ).toEqual({ customer_account: 11 });
  expect(await run(h, customerDirectory())).toHaveLength(100);
});

test("lost client/funding response requires positive read-only inspection before bounded resume", async () => {
  const h = setup();
  await run(h, prepareCustomerManifest("branch"));
  h.loseResponse("clients");
  expect(
    await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ uncertain: true });
  const calls = h.calls.filter((call) => call.method === "POST").length;
  expect(
    await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(calls);
  const row = (await run(h, customerSeedStatus("branch"))).customers[0];
  await run(h, inspectCustomerSeed(row.id));
  // The account will be 200; proving the original deposit receipt recovers lost funding.
  h.loseResponse("savingsaccounts/200/transactions?command=deposit");
  expect(
    await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ uncertain: true });
  const balance = h.accounts.get(200)?.summary.accountBalance;
  await run(h, inspectCustomerSeed(row.id));
  await run(h, resumeCustomerSeed("branch", 1, 1));
  expect(h.accounts.get(200)?.summary.accountBalance).toBe(balance);
  expect(
    h.calls.filter((call) => call.path.endsWith("command=deposit")),
  ).toHaveLength(1);
});

test("customer selection revokes prior token, rejects missing customer, retains independent cases/products", async () => {
  const h = setup();
  await run(h, prepareCustomerManifest("branch"));
  await run(h, resumeCustomerSeed("branch", 1, 2));
  const choices = await run(h, customerDirectory("Aadhya"));
  expect(choices).toHaveLength(1);
  expect(Object.keys(choices[0]).sort()).toEqual([
    "account_suffix",
    "display_name",
    "id",
    "reference",
  ]);
  h.db.run(
    "INSERT INTO sessions(token_hash,bank_id,role,expires_at) VALUES('old','branch','approver',9999999999999)",
  );
  const old = { ...session(), token_hash: "old" };
  const next = await run(h, selectCustomerScope(choices[0].id, "new", old));
  expect(next.role).toBe("customer");
  expect(
    h.db.query("SELECT * FROM sessions WHERE token_hash='old'").get(),
  ).toBeNull();
  h.db.run(
    "INSERT INTO audit(id,bank_id,actor,action,detail) VALUES('private-case','branch','customer','Legacy action','Legacy only')",
  );
  const view = await run(h, dashboard(next, true));
  expect(view.requests).toEqual([]);
  expect(view.audit).toEqual([]);
  expect(view.commands).toEqual([]);
  expect(view.account?.id).not.toBe(11);
  expect(
    await run(h, selectCustomerScope("missing", "bad").pipe(Effect.flip)),
  ).toMatchObject({ status: 404 });
});

const twoCustomers = async () => {
  const h = setup();
  await run(h, prepareCustomerManifest("branch"));
  await run(h, resumeCustomerSeed("branch", 1, 1));
  const rows = (await run(h, customerSeedStatus("branch"))).customers;
  return {
    h,
    source: session(),
    recipientId: rows[0].id,
    recipient: session(rows[0].id),
  };
};
test("one retail confirmation creates exact debit and credit; reload/switch observes both persistent statements", async () => {
  const { h, source, recipientId, recipient } = await twoCustomers();
  const sourceBefore = h.accounts.get(11)?.summary.accountBalance ?? 0;
  const recipientBefore = h.accounts.get(200)?.summary.accountBalance ?? 0;
  const { offer } = await run(
    h,
    reviewCustomerTransfer(source, recipientId, "1234.56"),
  );
  const result = await run(
    h,
    confirmCustomerTransfer(source, offer.id, "original-key-123"),
  );
  expect(result.status).toBe("posted");
  expect(result.receipt).toMatchObject({
    amount_minor: 123456,
    source_balance_minor: Math.round((sourceBefore - 1234.56) * 100),
    recipient_balance_minor: Math.round((recipientBefore + 1234.56) * 100),
  });
  const sourceView = await run(h, dashboard(source, true));
  const recipientView = await run(h, dashboard(recipient, true));
  expect(sourceView.account?.summary?.accountBalance).toBe(
    sourceBefore - 1234.56,
  );
  expect(recipientView.account?.summary?.accountBalance).toBe(
    recipientBefore + 1234.56,
  );
  expect(
    sourceView.account?.transactions?.at(-1)?.transactionType,
  ).toMatchObject({ id: 2 });
  expect(
    recipientView.account?.transactions?.at(-1)?.transactionType,
  ).toMatchObject({ id: 1 });
  expect(recipientView.commands).toHaveLength(0);
  await run(h, confirmCustomerTransfer(source, offer.id, "original-key-123"));
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(1);
  expect(
    h.db
      .query("SELECT status FROM core_write_claims WHERE owner_id=?")
      .get(result.id),
  ).toEqual({ status: "confirmed" });
});

test("concurrent confirmations, different keys and overdraft cannot double post", async () => {
  const { h, source, recipientId } = await twoCustomers();
  const { offer } = await run(
    h,
    reviewCustomerTransfer(source, recipientId, "90000"),
  );
  const results = await Promise.allSettled([
    run(
      h,
      confirmCustomerTransfer(source, offer.id, "concurrent-original-key"),
    ),
    run(
      h,
      confirmCustomerTransfer(source, offer.id, "concurrent-original-key"),
    ),
    run(h, confirmCustomerTransfer(source, offer.id, "different-original-key")),
  ]);
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(1);
  expect(h.accounts.get(11)?.summary.accountBalance).toBe(10000);
  expect(
    await run(
      h,
      reviewCustomerTransfer(source, recipientId, "10000.01").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
});

test("lost transfer response blocks later writes until read-only two-leg proof; no automatic repost", async () => {
  const { h, source, recipientId } = await twoCustomers();
  const { offer } = await run(
    h,
    reviewCustomerTransfer(source, recipientId, "250.01"),
  );
  h.loseResponse("accounttransfers");
  const result = await run(
    h,
    confirmCustomerTransfer(source, offer.id, "lost-response-key"),
  );
  expect(result.status).toBe("uncertain");
  h.hideRecipientCredit(true);
  expect(
    (await run(h, inspectCustomerTransfer(source, result.id))).status,
  ).toBe("uncertain");
  expect(
    h.db
      .query("SELECT status FROM core_write_claims WHERE owner_id=?")
      .get(result.id),
  ).toEqual({ status: "uncertain" });
  h.hideRecipientCredit(false);
  expect(
    (await run(h, inspectCustomerTransfer(source, result.id))).status,
  ).toBe("posted");
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(1);
});

test("money, role, recipient ownership and review expiry fail before dispatch", async () => {
  const { h, source, recipientId } = await twoCustomers();
  for (const amount of ["0", "-1", "1e2", "0.001", "NaN", "10000000.01"])
    expect(
      await run(
        h,
        reviewCustomerTransfer(source, recipientId, amount).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 400 });
  expect(
    await run(
      h,
      reviewCustomerTransfer(
        { ...source, role: "officer" },
        recipientId,
        "1",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await run(
      h,
      reviewCustomerTransfer(source, "legacy-branch", "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await run(
      h,
      reviewCustomerTransfer(source, "arbitrary-core-account", "1").pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 404 });
  await run(
    h,
    registerCustomer({
      id: "foreign",
      branch_id: "other",
      bank_id: "other",
      reference: "SYN-FOREIGN",
      display_name: "Priya Synthetic",
      client_id: 4,
      account_id: 14,
      account_no: "SYN00000014",
      origin: "legacy",
    }),
  );
  expect(
    await run(
      h,
      reviewCustomerTransfer(source, "foreign", "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(h.calls.filter((call) => call.path === "accounttransfers")).toEqual(
    [],
  );
});

test("applicant allocation is local/idempotent and registerOpened shares one registry without legacy mutation", async () => {
  const h = setup();
  const original = session();
  const first = await run(
    h,
    createApplicantScope(original, "applicant-operation-1"),
  );
  expect(
    await run(h, createApplicantScope(original, "applicant-operation-1")),
  ).toEqual(first);
  expect(h.calls).toEqual([]);
  expect(
    await run(
      h,
      createApplicantScope(
        { ...original, token_hash: "foreign-token" },
        "applicant-operation-1",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await run(h, assertApplicantScope(original).pipe(Effect.flip)),
  ).toMatchObject({ status: 403 });
  const applicant = { ...original, bank_id: first.bankId };
  expect(await run(h, assertApplicantScope(applicant))).toMatchObject({
    customerId: first.customerId,
    branchId: "branch",
  });
  h.db.run(
    "UPDATE banks SET customer_client=4,customer_account=14 WHERE id=?",
    [first.bankId],
  );
  const registered = await run(h, registerOpenedCustomer(applicant));
  expect(registered.origin).toBe("onboarding");
  const reselected = await run(
    h,
    selectCustomerScope(registered.id, "rotated-opened-customer"),
  );
  expect(await run(h, assertApplicantScope(reselected))).toMatchObject({
    bankId: first.bankId,
    customerId: first.customerId,
  });
  expect(
    h.db.query("SELECT journey FROM banks WHERE id=?").get(first.bankId),
  ).toEqual({ journey: "existing" });
  expect((await run(h, registeredCustomer(registered.id))).account_id).toBe(14);
  expect(
    h.db.query("SELECT customer_account FROM banks WHERE id='branch'").get(),
  ).toEqual({ customer_account: 11 });
});

test("selected customer teller cash keeps separate approval and coherent deposit/withdrawal/transfer history", async () => {
  const { h, source, recipientId, recipient } = await twoCustomers();
  for (const [index, selected] of [source, recipient].entries()) {
    const officer = { ...selected, role: "officer" as const };
    const approver = { ...selected, role: "approver" as const };
    expect(
      await run(
        h,
        createCommand(
          selected,
          { kind: "deposit", amount: 100 },
          `customer-cash-${index}`,
        ).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 403 });
    const deposit = await run(
      h,
      createCommand(
        officer,
        { kind: "deposit", amount: 1000.01 },
        `teller-deposit-${index}`,
      ),
    );
    expect(deposit.status).toBe("pending");
    expect(
      await run(h, executeCommand(officer, deposit.id).pipe(Effect.flip)),
    ).toMatchObject({ status: 403 });
    expect((await run(h, executeCommand(approver, deposit.id))).status).toBe(
      "posted",
    );
    const withdrawal = await run(
      h,
      createCommand(
        officer,
        { kind: "withdrawal", amount: 200.01 },
        `teller-withdrawal-${index}`,
      ),
    );
    expect((await run(h, executeCommand(approver, withdrawal.id))).status).toBe(
      "posted",
    );
  }
  const { offer } = await run(
    h,
    reviewCustomerTransfer(source, recipientId, "300"),
  );
  const sent = await run(
    h,
    confirmCustomerTransfer(source, offer.id, "teller-then-retail-key"),
  );
  expect(sent.status).toBe("posted");
  const from = await run(h, dashboard(source, true)),
    to = await run(h, dashboard(recipient, true));
  expect(from.account?.summary?.accountBalance).toBe(100500);
  expect(to.account?.summary?.accountBalance).toBe(16100);
  expect(from.commands.map((row) => row.kind).sort()).toEqual([
    "deposit",
    "transfer",
    "withdrawal",
  ]);
  expect(to.commands.map((row) => row.kind).sort()).toEqual([
    "deposit",
    "withdrawal",
  ]);
  expect(
    from.account?.transactions?.map((row) => row.transactionType.value),
  ).toEqual(["Deposit", "Withdrawal", "Withdrawal"]);
  expect(
    to.account?.transactions?.map((row) => row.transactionType.value),
  ).toEqual(["Deposit", "Deposit", "Withdrawal", "Deposit"]);
  const fields = h.db
    .query(
      "SELECT json_extract(fields,'$.email') AS email,json_extract(fields,'$.address') AS address FROM synthetic_profiles WHERE bank_id=?",
    )
    .get(recipient.bank_id);
  expect(fields).toEqual({ email: "", address: "" });
});

test("unresolved retail command and existing teller command arbitrate the same source claim", async () => {
  const { h, source, recipientId } = await twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const approver = { ...source, role: "approver" as const };
  const pending = await run(
    h,
    createCommand(
      officer,
      { kind: "withdrawal", amount: 1 },
      "cash-before-uncertain-transfer",
    ),
  );
  const { offer } = await run(
    h,
    reviewCustomerTransfer(source, recipientId, "2"),
  );
  h.loseResponse("accounttransfers");
  const result = await run(
    h,
    confirmCustomerTransfer(source, offer.id, "uncertain-arbitration-key"),
  );
  expect(result.status).toBe("uncertain");
  expect(
    await run(h, executeCommand(approver, pending.id).pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  expect(
    await run(
      h,
      createCommand(
        officer,
        { kind: "deposit", amount: 1 },
        "new-cash-during-uncertain",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  await run(h, inspectCustomerTransfer(source, result.id));
  expect((await run(h, executeCommand(approver, pending.id))).status).toBe(
    "posted",
  );
});

test("bounded administration advances one original stage and exposes exact durable status", async () => {
  const h = setup();
  const command = {
    action: "prepare" as const,
    branchId: "branch",
    customerId: "",
    start: 1,
    limit: 2,
    maxStages: 1,
  };
  await run(h, runCustomerAdmin(command));
  for (let index = 0; index < 10; index++) {
    const before = h.calls.filter((call) => call.method === "POST").length;
    await run(h, runCustomerAdmin({ ...command, action: "resume" }));
    expect(
      h.calls.filter((call) => call.method === "POST").length - before,
    ).toBe(1);
  }
  const status = await run(
    h,
    runCustomerAdmin({ ...command, action: "status" }),
  );
  expect(status.operations).toHaveLength(10);
  expect(status.operations.every((row) => row.status === "confirmed")).toBe(
    true,
  );
  expect(status.registered?.count).toBe(2);
  expect(
    await run(
      h,
      runCustomerAdmin({
        ...command,
        action: "inspect",
        customerId: "foreign-manifest",
      }).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
});

test("missing or changed two-sided transfer proof never releases the original claim or replays", async () => {
  const { h, source, recipientId } = await twoCustomers();
  const { offer } = await run(
    h,
    reviewCustomerTransfer(source, recipientId, "1.23"),
  );
  h.hideRecipientCredit(true);
  const sent = await run(
    h,
    confirmCustomerTransfer(source, offer.id, "proof-mismatch-original"),
  );
  expect(sent.status).toBe("uncertain");
  expect(await run(h, customerTransferHistory(source))).toMatchObject([
    {
      id: sent.id,
      status: "uncertain",
      amount_minor: 123,
      recipient_name: "Aadhya Iyer",
    },
  ]);
  h.hideRecipientCredit(false);
  const transferId = [...h.transfers.keys()][0];
  const original = h.transfers.get(transferId) as Record<string, unknown>;
  for (const patch of [
    { fromClient: { id: 999 } },
    { toAccount: { id: 11 } },
    { reversed: true },
    { transferAmount: 1.24 },
    { currency: { code: "USD", decimalPlaces: 2 } },
    { transferDate: "2000-01-01" },
  ]) {
    h.transfers.set(transferId, { ...original, ...patch });
    expect(
      (await run(h, inspectCustomerTransfer(source, sent.id))).status,
    ).toBe("uncertain");
    expect(
      h.db
        .query("SELECT status FROM core_write_claims WHERE owner_id=?")
        .get(sent.id),
    ).toEqual({ status: "uncertain" });
  }
  h.transfers.set(transferId, original);
  expect((await run(h, inspectCustomerTransfer(source, sent.id))).status).toBe(
    "posted",
  );
  expect(
    h.calls.filter((call) => call.path === "accounttransfers"),
  ).toHaveLength(1);
});

test("absent seed proof is not permission to retry or replace the original stage", async () => {
  const h = setup();
  await run(h, prepareCustomerManifest("branch"));
  h.loseResponse("clients");
  await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip));
  h.clients.delete(100);
  await run(h, inspectCustomerSeed("sample-branch-001"));
  expect(
    await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  expect(() => h.db.run("DELETE FROM customer_seed_operations")).toThrow();
  expect(() =>
    h.db.run("UPDATE customer_seed_operations SET command_key='new-key'"),
  ).toThrow();
});

test("disk reopen retains original seed keys and ambiguous creation for read-only recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finacle7-seed-reopen-"));
  const h = customerHarness(join(directory, "workflows.sqlite"));
  try {
    await run(h, prepareCustomerManifest("branch"));
    h.loseResponse("clients");
    await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip));
    const original = h.db
      .query(
        "SELECT * FROM customer_seed_operations WHERE seed_id='sample-branch-001'",
      )
      .get();
    h.reopen();
    expect(
      h.db
        .query(
          "SELECT * FROM customer_seed_operations WHERE seed_id='sample-branch-001'",
        )
        .get(),
    ).toEqual(original);
    expect(
      await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
    ).toMatchObject({ status: 409 });
    await run(h, inspectCustomerSeed("sample-branch-001"));
    await run(h, resumeCustomerSeed("branch", 1, 1));
    await run(h, resumeCustomerSeed("branch", 1, 1));
    expect(
      h.calls.filter(
        (call) => call.method === "POST" && call.path === "clients",
      ),
    ).toHaveLength(1);
    expect(
      h.calls.filter((call) => call.path.endsWith("command=deposit")),
    ).toHaveLength(1);
    expect((await run(h, customerSeedStatus("branch"))).registered?.count).toBe(
      1,
    );
  } finally {
    h.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("Core embedded ISO transfer dates support eligibility and both-leg proof, while malformed calendars fail closed", async () => {
  const { h, source, recipientId } = await twoCustomers();
  h.useISOTransferDates();
  for (const [index, amount] of ["1.23", "2.34"].entries()) {
    const { offer } = await run(
      h,
      reviewCustomerTransfer(source, recipientId, amount),
    );
    expect(
      (
        await run(
          h,
          confirmCustomerTransfer(
            source,
            offer.id,
            `iso-original-transfer-${index}`,
          ),
        )
      ).status,
    ).toBe("posted");
  }
  const original = h.db
    .query<{ id: string }, []>(
      "SELECT id FROM commands WHERE kind='transfer' ORDER BY rowid LIMIT 1",
    )
    .get();
  const embedded = h.accounts.get(11)?.transactions[0]?.transfer;
  if (!original || !embedded)
    throw new Error("Missing original transfer fixture");
  embedded.transferDate = "2026-02-30";
  expect(
    (await run(h, inspectCustomerTransfer(source, original.id))).status,
  ).toBe("uncertain");
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(2);
});
test("funding proof requires owned transaction detail receipt and cash type when association rows omit payment details", async () => {
  const h = setup();
  await run(h, prepareCustomerManifest("branch"));
  h.loseResponse("savingsaccounts/200/transactions?command=deposit");
  await run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip));
  const transaction = h.accounts.get(200)?.transactions[0];
  const operation = h.db
    .query<{ command_key: string }, []>(
      "SELECT command_key FROM customer_seed_operations WHERE seed_id='sample-branch-001' AND stage='fund'",
    )
    .get();
  if (!transaction?.paymentDetailData || !operation)
    throw new Error("Original funding receipt missing");
  const listed = await run(
    h,
    Effect.gen(function* () {
      const core = yield* Core;
      return yield* core.request<{
        transactions: { paymentDetailData?: unknown }[];
      }>("GET", "savingsaccounts/200?associations=transactions");
    }),
  );
  expect(listed.transactions[0].paymentDetailData).toBeUndefined();
  expect(h.accounts.get(200)?.savingsProductId).toBe(1);
  expect(Object.hasOwn(h.accounts.get(200) ?? {}, "productId")).toBe(false);
  transaction.paymentDetailData.receiptNumber = "different-original";
  await run(h, inspectCustomerSeed("sample-branch-001"));
  expect(
    h.db
      .query(
        "SELECT status FROM customer_seed_operations WHERE seed_id='sample-branch-001' AND stage='fund'",
      )
      .get(),
  ).toEqual({ status: "uncertain" });
  transaction.paymentDetailData.receiptNumber = operation.command_key;
  transaction.paymentDetailData.paymentType.id = 999;
  await run(h, inspectCustomerSeed("sample-branch-001"));
  expect(
    h.db
      .query(
        "SELECT status FROM customer_seed_operations WHERE seed_id='sample-branch-001' AND stage='fund'",
      )
      .get(),
  ).toEqual({ status: "uncertain" });
  transaction.paymentDetailData.paymentType.id = 1;
  await run(h, inspectCustomerSeed("sample-branch-001"));
  await run(h, resumeCustomerSeed("branch", 1, 1));
  expect(
    h.calls.some((call) =>
      /^savingsaccounts\/200\/transactions\/\d+$/.test(call.path),
    ),
  ).toBe(true);
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(5);
  expect((await run(h, customerSeedStatus("branch"))).registered?.count).toBe(
    1,
  );
});
