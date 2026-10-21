import { expect, test } from "bun:test";
import { Effect } from "effect";
import { verifyRepaymentPilotResponse } from "../../../src/operations/cli/loan-repayment-report";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import {
  createLoanQuote,
  submitLoanApplication,
} from "../../../src/platform/lending/application/loan-origination";
import {
  actOnRepayment,
  createRepaymentOffer,
  inspectRepayment,
} from "../../../src/platform/lending/application/loan-repayment";
import { savedRepaymentForKey } from "../../../src/platform/lending/application/loan-repayment-records";
import { workflowQuote } from "../../fixtures/loan-workflow";
import { createHarness } from "./loan-repayment-workflow.harness";

const harness = createHarness();
test("a confirmed payment remains paid when savings refresh is unavailable and malformed pilot receipts fail closed", async () => {
  const d = await harness.recommended();
  harness.failBalance = true;
  const paid = await harness.act(
    d,
    "pay",
    harness.approver,
    "receipt-correlate-key",
  );
  expect(paid.repayment.status).toBe("paid");
  expect(paid.financial_view_stale).toBe(true);
  expect(paid.recorded_operation?.status).toBe("confirmed");
  const command = {
    kind: "action" as const,
    role: "approver" as const,
    key: "receipt-correlate-key",
    command: {
      id: d.repayment.id,
      version: d.repayment.version,
      action: "pay" as const,
      note: "Independent invented repayment review",
    },
  };
  for (const invalid of [
    { recorded_key: "different-original-key" },
    { recorded_actor: "customer" },
    { recorded_operation: null },
    { recorded_request: { ...command.command, version: 99 } },
  ])
    expect(
      await harness.run(
        Effect.flip(
          verifyRepaymentPilotResponse(command, { ...paid, ...invalid }),
        ),
      ),
    ).toBeInstanceOf(Error);
  expect(harness.dispatches).toHaveLength(1);
});

for (const part of ["operation", "claim"] as const)
  test(`lost ${part} reservation read acknowledgement never dispatches an uncorroborated original`, async () => {
    const d = await harness.recommended();
    const key = crypto.randomUUID();
    harness.failReservationRead = part;
    expect(
      (
        await harness.denied(
          actOnRepayment(
            harness.approver,
            {
              id: d.repayment.id,
              version: d.repayment.version,
              action: "pay",
              note: "Original reviewed payment",
            },
            key,
          ),
        )
      ).uncertain,
    ).toBe(true);
    expect(harness.dispatches).toHaveLength(0);
    harness.failReservationRead = undefined;
    const found = await harness.run(
      savedRepaymentForKey(harness.approver, key),
    );
    expect(found.operation?.status).toBe("executing");
    expect(
      (await harness.run(inspectRepayment(harness.approver, d.repayment.id)))
        .operation?.status,
    ).toBe("uncertain");
    expect(harness.dispatches).toHaveLength(0);
  });

test("ineligible loan state fails before product/Core reads and confirmed historical proof survives later relationship ineligibility", async () => {
  const q = await harness.run(
    createLoanQuote(harness.customer, workflowQuote.terms),
  );
  const unfunded = await harness.run(
    submitLoanApplication(
      harness.customer,
      { quote_id: q.quote.id, consent: true },
      crypto.randomUUID(),
    ),
  );
  const oldReads = harness.reads.length;
  expect(
    (
      await harness.denied(
        createRepaymentOffer(harness.customer, {
          loan_id: unfunded.loan.id,
          amount_minor: 100000,
        }),
      )
    ).status,
  ).toBe(409);
  expect(harness.reads).toHaveLength(oldReads);
  const d = await harness.recommended();
  harness.writerError = new BankingError({
    message: "Lost committed reply",
    status: 503,
    uncertain: true,
  });
  harness.commitBeforeError = true;
  const original = await harness.act(d, "pay", harness.approver);
  expect(original.operation?.status).toBe("uncertain");
  harness.writerError = undefined;
  harness.closeRelationshipAfterConfirmation = true;
  const confirmed = await harness.run(
    inspectRepayment(harness.approver, d.repayment.id),
  );
  expect(confirmed.repayment.status).toBe("paid");
  expect(confirmed.recorded_operation?.status).toBe("confirmed");
  expect(confirmed.financial_view_stale).toBe(true);
  expect(harness.dispatches).toHaveLength(1);
  const readCount = harness.reads.length;
  expect(
    (await harness.run(inspectRepayment(harness.approver, d.repayment.id)))
      .recorded_operation?.status,
  ).toBe("confirmed");
  expect(harness.reads).toHaveLength(readCount);
  expect(harness.confirmations).toHaveLength(1);
});
