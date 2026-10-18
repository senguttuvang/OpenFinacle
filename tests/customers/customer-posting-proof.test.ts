import { expect, test } from "bun:test";
import { Effect } from "effect";
import { reviewCustomerTransfer } from "../../src/platform/payments/application/customer-transfers";
import { createHarness } from "./customer-banking.harness";

const harness = createHarness();
test("current debit/credit blocks, transfer fees and overdraft policy reject ineligible pairs before review or dispatch", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const sender = h.accounts.get(11),
    recipient = h.accounts.get(200);
  if (!sender || !recipient) throw new Error("Missing registered pair");
  recipient.subStatus = { blockCredit: true };
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  recipient.subStatus = { blockCredit: false };
  sender.subStatus = { blockDebit: true };
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  sender.subStatus = { blockDebit: false };
  sender.allowOverdraft = true;
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  sender.allowOverdraft = false;
  sender.withdrawalFeeForTransfers = true;
  expect(
    await harness.run(
      h,
      reviewCustomerTransfer(source, recipientId, "1").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 409 });
  expect(
    h.calls.filter(
      (call) => call.method === "POST" && call.path === "accounttransfers",
    ),
  ).toHaveLength(0);
});
