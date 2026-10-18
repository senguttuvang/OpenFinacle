import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  customerSeedStatus,
  inspectCustomerSeed,
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../../src/demo/customers/customer-provisioning";
import { dashboard } from "../../src/platform/banking-workspace/application/banking";
import {
  assertApplicantScope,
  createApplicantScope,
  customerDirectory,
  registerCustomer,
  registeredCustomer,
  registerOpenedCustomer,
  selectCustomerScope,
} from "../../src/platform/customers/application/customer-registry";
import {
  confirmCustomerTransfer,
  inspectCustomerTransfer,
  reviewCustomerTransfer,
} from "../../src/platform/payments/application/customer-transfers";
import { createHarness } from "./customer-banking.harness";

const harness = createHarness();
test("100 durable unique synthetic customers own distinct Core clients/accounts; repeat does not fund or reset", async () => {
  const h = harness.setup();
  await harness.run(h, prepareCustomerManifest("branch"));
  for (let start = 1; start <= 100; start += 10)
    await harness.run(h, resumeCustomerSeed("branch", start, 10));
  const first = await harness.run(h, customerSeedStatus("branch"));
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
  await harness.run(h, prepareCustomerManifest("branch"));
  await harness.run(h, resumeCustomerSeed("branch", 1, 10));
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(writes);
  expect(account.summary.accountBalance).toBe(123.45);
  expect(
    h.db.query("SELECT customer_account FROM banks WHERE id='branch'").get(),
  ).toEqual({ customer_account: 11 });
  expect(await harness.run(h, customerDirectory())).toHaveLength(100);
});

test("lost client/funding response requires positive read-only inspection before bounded resume", async () => {
  const h = harness.setup();
  await harness.run(h, prepareCustomerManifest("branch"));
  h.loseResponse("clients");
  expect(
    await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ uncertain: true });
  const calls = h.calls.filter((call) => call.method === "POST").length;
  expect(
    await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ status: 409 });
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(calls);
  const row = (await harness.run(h, customerSeedStatus("branch"))).customers[0];
  await harness.run(h, inspectCustomerSeed(row.id));
  // The account will be 200; proving the original deposit receipt recovers lost funding.
  h.loseResponse("savingsaccounts/200/transactions?command=deposit");
  expect(
    await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
  ).toMatchObject({ uncertain: true });
  const balance = h.accounts.get(200)?.summary.accountBalance;
  await harness.run(h, inspectCustomerSeed(row.id));
  await harness.run(h, resumeCustomerSeed("branch", 1, 1));
  expect(h.accounts.get(200)?.summary.accountBalance).toBe(balance);
  expect(
    h.calls.filter((call) => call.path.endsWith("command=deposit")),
  ).toHaveLength(1);
});

test("customer selection revokes prior token, rejects missing customer, retains independent cases/products", async () => {
  const h = harness.setup();
  await harness.run(h, prepareCustomerManifest("branch"));
  await harness.run(h, resumeCustomerSeed("branch", 1, 2));
  const choices = await harness.run(h, customerDirectory("Aadhya"));
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
  const old = { ...harness.session(), token_hash: "old" };
  const next = await harness.run(
    h,
    selectCustomerScope(choices[0].id, "new", old),
  );
  expect(next.role).toBe("customer");
  expect(
    h.db.query("SELECT * FROM sessions WHERE token_hash='old'").get(),
  ).toBeNull();
  h.db.run(
    "INSERT INTO audit(id,bank_id,actor,action,detail) VALUES('private-case','branch','customer','Legacy action','Legacy only')",
  );
  const view = await harness.run(h, dashboard(next, true));
  expect(view.requests).toEqual([]);
  expect(view.audit).toEqual([]);
  expect(view.commands).toEqual([]);
  expect(view.account?.id).not.toBe(11);
  expect(
    await harness.run(
      h,
      selectCustomerScope("missing", "bad").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
});

test("one retail confirmation creates exact debit and credit; reload/switch observes both persistent statements", async () => {
  const { h, source, recipientId, recipient } = await harness.twoCustomers();
  const sourceBefore = h.accounts.get(11)?.summary.accountBalance ?? 0;
  const recipientBefore = h.accounts.get(200)?.summary.accountBalance ?? 0;
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "1234.56"),
  );
  const result = await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "original-key-123"),
  );
  expect(result.status).toBe("posted");
  expect(result.receipt).toMatchObject({
    amount_minor: 123456,
    source_balance_minor: Math.round((sourceBefore - 1234.56) * 100),
    recipient_balance_minor: Math.round((recipientBefore + 1234.56) * 100),
  });
  const sourceView = await harness.run(h, dashboard(source, true));
  const recipientView = await harness.run(h, dashboard(recipient, true));
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
  await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "original-key-123"),
  );
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

test("a newly opened zero-balance recipient may omit empty Core history and receives one proven transfer", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const account = h.accounts.get(200);
  if (!account) throw Error("Missing recipient fixture");
  account.summary.availableBalance = account.summary.accountBalance = 0;
  account.transactions = [];
  h.omitTransactionHistoryFor(200);
  const before = h.calls.filter((call) => call.method === "POST").length;
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "400"),
  );
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(before);
  const result = await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "empty-recipient-original"),
  );
  expect(result.status).toBe("posted");
  expect(result.receipt).toMatchObject({
    amount_minor: 40000,
    recipient_balance_minor: 40000,
  });
  expect(account.transactions).toHaveLength(1);
  await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "empty-recipient-original"),
  );
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(1);
});

test("an omitted history on a funded account stays unavailable before any transfer dispatch", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  h.omitTransactionHistoryFor(200, false);
  const before = h.calls.filter((call) => call.method === "POST").length;
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, "400").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 503 });
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(before);
});

test("concurrent confirmations, different keys and overdraft cannot double post", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "90000"),
  );
  const results = await Promise.allSettled([
    harness.run(
      h,
      confirmCustomerTransfer(source, offer.id, "concurrent-original-key"),
    ),
    harness.run(
      h,
      confirmCustomerTransfer(source, offer.id, "concurrent-original-key"),
    ),
    harness.run(
      h,
      confirmCustomerTransfer(source, offer.id, "different-original-key"),
    ),
  ]);
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(1);
  expect(h.accounts.get(11)?.summary.accountBalance).toBe(10000);
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, "10000.01").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 400 });
});

test("lost transfer response blocks later writes until read-only two-leg proof; no automatic repost", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "250.01"),
  );
  h.loseResponse("accounttransfers");
  const result = await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "lost-response-key"),
  );
  expect(result.status).toBe("uncertain");
  h.hideRecipientCredit(true);
  expect(
    (await harness.run(h, inspectCustomerTransfer(source, result.id))).status,
  ).toBe("uncertain");
  expect(
    h.db
      .query("SELECT status FROM core_write_claims WHERE owner_id=?")
      .get(result.id),
  ).toEqual({ status: "uncertain" });
  h.hideRecipientCredit(false);
  expect(
    (await harness.run(h, inspectCustomerTransfer(source, result.id))).status,
  ).toBe("posted");
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(1);
});

test("money, role, recipient ownership and review expiry fail before dispatch", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  for (const amount of ["0", "-1", "1e2", "0.001", "NaN", "10000000.01"])
    expect(
      await harness.run(
        h,
        reviewCustomerTransfer(source, recipientId, amount).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 400 });
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(
        { ...source, role: "officer" },
        recipientId,
        "1",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, "legacy-branch", "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, "arbitrary-core-account", "1").pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 409 });
  await harness.run(
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
    await harness.run(
      h,
      reviewCustomerTransfer(source, "foreign", "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(h.calls.filter((call) => call.path === "accounttransfers")).toEqual(
    [],
  );
});

test("applicant allocation is local/idempotent and registerOpened shares one registry without legacy mutation", async () => {
  const h = harness.setup();
  const original = harness.session();
  const first = await harness.run(
    h,
    createApplicantScope(original, "applicant-operation-1"),
  );
  expect(
    await harness.run(
      h,
      createApplicantScope(original, "applicant-operation-1"),
    ),
  ).toEqual(first);
  expect(h.calls).toEqual([]);
  expect(
    await harness.run(
      h,
      createApplicantScope(
        { ...original, token_hash: "foreign-token" },
        "applicant-operation-1",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  expect(
    await harness.run(h, assertApplicantScope(original).pipe(Effect.flip)),
  ).toMatchObject({ status: 403 });
  const applicant = { ...original, bank_id: first.bankId };
  expect(await harness.run(h, assertApplicantScope(applicant))).toMatchObject({
    customerId: first.customerId,
    branchId: "branch",
  });
  h.db.run(
    "UPDATE banks SET customer_client=4,customer_account=14 WHERE id=?",
    [first.bankId],
  );
  const registered = await harness.run(h, registerOpenedCustomer(applicant));
  expect(registered.origin).toBe("onboarding");
  const reselected = await harness.run(
    h,
    selectCustomerScope(registered.id, "rotated-opened-customer"),
  );
  expect(await harness.run(h, assertApplicantScope(reselected))).toMatchObject({
    bankId: first.bankId,
    customerId: first.customerId,
  });
  expect(
    h.db.query("SELECT journey FROM banks WHERE id=?").get(first.bankId),
  ).toEqual({ journey: "existing" });
  expect(
    (await harness.run(h, registeredCustomer(registered.id))).account_id,
  ).toBe(14);
  expect(
    h.db.query("SELECT customer_account FROM banks WHERE id='branch'").get(),
  ).toEqual({ customer_account: 11 });
});
