import { expect, test } from "bun:test";
import { readLoanPostingEvidence } from "../../../src/platform/lending/application/loan-posting-evidence";
import { createHarness } from "./loan-repayment-workflow.harness";

const harness = createHarness();
test("confirmed repayment source uses the validated immutable native loan transaction reference", async () => {
  const recommended = await harness.recommended();
  const paid = await harness.act(
    recommended,
    "pay",
    harness.approver,
    "posting-source-payment",
  );
  const before = harness.dispatches.length,
    reads = harness.reads.length;
  const evidence = await harness.run(
    readLoanPostingEvidence(harness.officer, harness.coreLoan.id, 41, 51),
  );
  const receipt = evidence.receipts.find((r) => r.kind === "repayment");
  expect(receipt?.recordId).toBe(paid.repayment.id);
  expect(receipt?.transactionId).toBe(
    paid.recorded_operation?.result?.loan_transaction_id,
  );
  expect(receipt?.history.length).toBe(4);
  expect(harness.dispatches).toHaveLength(before);
  expect(harness.reads).toHaveLength(reads);
});
