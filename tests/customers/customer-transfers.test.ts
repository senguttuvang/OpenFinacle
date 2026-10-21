import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { runCustomerAdmin } from "../../src/demo/customers/customer-admin";
import {
  customerSeedStatus,
  inspectCustomerSeed,
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../../src/demo/customers/customer-provisioning";
import {
  createCommand,
  dashboard,
  executeCommand,
} from "../../src/platform/banking-workspace/application/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import {
  confirmCustomerTransfer,
  customerTransferHistory,
  inspectCustomerTransfer,
  reviewCustomerTransfer,
} from "../../src/platform/payments/application/customer-transfers";
import { customerHarness } from "../fixtures/customer-banking";
import { createHarness } from "./customer-banking.harness";

const harness = createHarness();
test("selected customer teller cash keeps separate approval and coherent deposit/withdrawal/transfer history", async () => {
  const { h, source, recipientId, recipient } = await harness.twoCustomers();
  for (const [index, selected] of [source, recipient].entries()) {
    const officer = { ...selected, role: "officer" as const };
    const approver = { ...selected, role: "approver" as const };
    expect(
      await harness.run(
        h,
        createCommand(
          selected,
          { kind: "deposit", amount: 100 },
          `customer-cash-${index}`,
        ).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 403 });
    const deposit = await harness.run(
      h,
      createCommand(
        officer,
        { kind: "deposit", amount: 1000.01 },
        `teller-deposit-${index}`,
      ),
    );
    expect(deposit.status).toBe("pending");
    expect(
      await harness.run(
        h,
        executeCommand(officer, deposit.id).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 403 });
    expect(
      (await harness.run(h, executeCommand(approver, deposit.id))).status,
    ).toBe("posted");
    const withdrawal = await harness.run(
      h,
      createCommand(
        officer,
        { kind: "withdrawal", amount: 200.01 },
        `teller-withdrawal-${index}`,
      ),
    );
    expect(
      (await harness.run(h, executeCommand(approver, withdrawal.id))).status,
    ).toBe("posted");
  }
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "300"),
  );
  const sent = await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "teller-then-retail-key"),
  );
  expect(sent.status).toBe("posted");
  const from = await harness.run(h, dashboard(source, true)),
    to = await harness.run(h, dashboard(recipient, true));
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
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const approver = { ...source, role: "approver" as const };
  const pending = await harness.run(
    h,
    createCommand(
      officer,
      { kind: "withdrawal", amount: 1 },
      "cash-before-uncertain-transfer",
    ),
  );
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "2"),
  );
  h.loseResponse("accounttransfers");
  const result = await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "uncertain-arbitration-key"),
  );
  expect(result.status).toBe("uncertain");
  expect(
    await harness.run(
      h,
      executeCommand(approver, pending.id).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    await harness.run(
      h,
      createCommand(
        officer,
        { kind: "deposit", amount: 1 },
        "new-cash-during-uncertain",
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  await harness.run(h, inspectCustomerTransfer(source, result.id));
  expect(
    (await harness.run(h, executeCommand(approver, pending.id))).status,
  ).toBe("posted");
});

test("bounded administration advances one original stage and exposes exact durable status", async () => {
  const h = harness.setup();
  const command = {
    action: "prepare" as const,
    branchId: "branch",
    customerId: "",
    start: 1,
    limit: 2,
    maxStages: 1,
  };
  await harness.run(h, runCustomerAdmin(command));
  for (let index = 0; index < 10; index++) {
    const before = h.calls.filter((call) => call.method === "POST").length;
    await harness.run(h, runCustomerAdmin({ ...command, action: "resume" }));
    expect(
      h.calls.filter((call) => call.method === "POST").length - before,
    ).toBe(1);
  }
  const status = await harness.run(
    h,
    runCustomerAdmin({ ...command, action: "status" }),
  );
  expect(status.operations).toHaveLength(10);
  expect(status.operations.every((row) => row.status === "confirmed")).toBe(
    true,
  );
  expect(status.registered?.count).toBe(2);
  expect(
    await harness.run(
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
  const { h, source, recipientId } = await harness.twoCustomers();
  const { offer } = await harness.run(
    h,
    reviewCustomerTransfer(source, recipientId, "1.23"),
  );
  h.hideRecipientCredit(true);
  const sent = await harness.run(
    h,
    confirmCustomerTransfer(source, offer.id, "proof-mismatch-original"),
  );
  expect(sent.status).toBe("uncertain");
  expect(await harness.run(h, customerTransferHistory(source))).toMatchObject([
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
      (await harness.run(h, inspectCustomerTransfer(source, sent.id))).status,
    ).toBe("uncertain");
    expect(
      h.db
        .query("SELECT status FROM core_write_claims WHERE owner_id=?")
        .get(sent.id),
    ).toEqual({ status: "uncertain" });
  }
  h.transfers.set(transferId, original);
  expect(
    (await harness.run(h, inspectCustomerTransfer(source, sent.id))).status,
  ).toBe("posted");
  expect(
    h.calls.filter((call) => call.path === "accounttransfers"),
  ).toHaveLength(1);
});

test("absent seed proof is not permission to retry or replace the original stage", async () => {
  const h = harness.setup();
  await harness.run(h, prepareCustomerManifest("branch"));
  h.loseResponse("clients");
  await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip));
  h.clients.delete(100);
  await harness.run(h, inspectCustomerSeed("sample-branch-001"));
  expect(
    await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip)),
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
    await harness.run(h, prepareCustomerManifest("branch"));
    h.loseResponse("clients");
    await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip));
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
      await harness.run(
        h,
        resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 409 });
    await harness.run(h, inspectCustomerSeed("sample-branch-001"));
    await harness.run(h, resumeCustomerSeed("branch", 1, 1));
    await harness.run(h, resumeCustomerSeed("branch", 1, 1));
    expect(
      h.calls.filter(
        (call) => call.method === "POST" && call.path === "clients",
      ),
    ).toHaveLength(1);
    expect(
      h.calls.filter((call) => call.path.endsWith("command=deposit")),
    ).toHaveLength(1);
    expect(
      (await harness.run(h, customerSeedStatus("branch"))).registered?.count,
    ).toBe(1);
  } finally {
    h.db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Core embedded ISO transfer dates support eligibility and both-leg proof, while malformed calendars fail closed", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  h.useISOTransferDates();
  for (const [index, amount] of ["1.23", "2.34"].entries()) {
    const { offer } = await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, amount),
    );
    expect(
      (
        await harness.run(
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
    (await harness.run(h, inspectCustomerTransfer(source, original.id))).status,
  ).toBe("uncertain");
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(2);
});

test("funding proof requires owned transaction detail receipt and cash type when association rows omit payment details", async () => {
  const h = harness.setup();
  await harness.run(h, prepareCustomerManifest("branch"));
  h.loseResponse("savingsaccounts/200/transactions?command=deposit");
  await harness.run(h, resumeCustomerSeed("branch", 1, 1).pipe(Effect.flip));
  const transaction = h.accounts.get(200)?.transactions[0];
  const operation = h.db
    .query<{ command_key: string }, []>(
      "SELECT command_key FROM customer_seed_operations WHERE seed_id='sample-branch-001' AND stage='fund'",
    )
    .get();
  if (!transaction?.paymentDetailData || !operation)
    throw new Error("Original funding receipt missing");
  const listed = await harness.run(
    h,
    Effect.gen(function* () {
      const core = yield* Core;
      return yield* core.request<{
        transactions: { paymentDetailData?: unknown }[];
      }>("GET", "savingsaccounts/200?associations=transactions");
    }),
  );
  expect(listed.transactions[0].paymentDetailData).toBeUndefined();
  const detail = await harness.run(
    h,
    Effect.gen(function* () {
      const core = yield* Core;
      return yield* core.request<Record<string, unknown>>(
        "GET",
        `savingsaccounts/200/transactions/${transaction.id}`,
      );
    }),
  );
  expect(detail.transactionType).toBeUndefined();
  expect(h.accounts.get(200)?.savingsProductId).toBe(1);
  expect(Object.hasOwn(h.accounts.get(200) ?? {}, "productId")).toBe(false);
  transaction.paymentDetailData.receiptNumber = "different-original";
  await harness.run(h, inspectCustomerSeed("sample-branch-001"));
  expect(
    h.db
      .query(
        "SELECT status FROM customer_seed_operations WHERE seed_id='sample-branch-001' AND stage='fund'",
      )
      .get(),
  ).toEqual({ status: "uncertain" });
  transaction.paymentDetailData.receiptNumber = operation.command_key;
  transaction.paymentDetailData.paymentType.id = 999;
  await harness.run(h, inspectCustomerSeed("sample-branch-001"));
  expect(
    h.db
      .query(
        "SELECT status FROM customer_seed_operations WHERE seed_id='sample-branch-001' AND stage='fund'",
      )
      .get(),
  ).toEqual({ status: "uncertain" });
  transaction.paymentDetailData.paymentType.id = 1;
  await harness.run(h, inspectCustomerSeed("sample-branch-001"));
  await harness.run(h, resumeCustomerSeed("branch", 1, 1));
  expect(
    h.calls.some((call) =>
      /^savingsaccounts\/200\/transactions\/\d+$/.test(call.path),
    ),
  ).toBe(true);
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(5);
  expect(
    (await harness.run(h, customerSeedStatus("branch"))).registered?.count,
  ).toBe(1);
});
