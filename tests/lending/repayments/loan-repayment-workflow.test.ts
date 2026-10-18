import { expect, test } from "bun:test";
import {
  repaymentPilotReport,
  verifyRepaymentPilotResponse,
} from "../../../src/operations/cli/loan-repayment-report";
import { financialView } from "../../../src/platform/banking-workspace/application/financial-view";
import {
  type Bank,
  BankingError,
} from "../../../src/platform/banking-workspace/domain/banking";
import {
  actOnRepayment,
  createRepaymentOffer,
  inspectRepayment,
  submitRepayment,
} from "../../../src/platform/lending/application/loan-repayment";
import {
  listRepayments,
  savedRepaymentDetail,
  savedRepaymentForKey,
} from "../../../src/platform/lending/application/loan-repayment-records";
import { createHarness } from "./loan-repayment-workflow.harness";

const harness = createHarness();
test("customer review and separate authorization reserve before one Core payment and saved reads never wake Core", async () => {
  const preview = await harness.quote();
  expect(preview.financial_posted).toBe(false);
  expect(harness.dispatches).toHaveLength(0);
  const submitted = await harness.run(
    submitRepayment(
      harness.customer,
      { offer_id: preview.offer.id, consent: true },
      "original-consent-key",
      "admin-pilot",
    ),
  );
  const review = await harness.act(submitted, "recommend", harness.officer);
  const paid = await harness.act(
    review,
    "pay",
    harness.approver,
    "original-payment-key",
  );
  expect(paid.repayment).toMatchObject({
    status: "paid",
    maker: "officer",
    checker: "approver",
    version: 3,
    origin: "admin-pilot",
  });
  expect(paid.history).toHaveLength(4);
  expect(paid.recorded_operation?.result).toMatchObject({
    amount_minor: 100000,
    principal_minor: 90000,
    interest_minor: 10000,
  });
  expect(harness.balance).toBe(1900000);
  expect(paid.financial_view_stale).toBe(false);
  expect(paid.core?.snapshot.statement?.repayment_minor).toBe(100000);
  const previousReads = harness.reads.length;
  for (const role of [harness.customer, harness.officer, harness.approver]) {
    expect(
      (await harness.run(savedRepaymentDetail(role, paid.repayment.id)))
        .repayment.status,
    ).toBe("paid");
    expect(
      (await harness.run(listRepayments(role, harness.loanId))).repayments,
    ).toHaveLength(1);
  }
  expect(harness.reads).toHaveLength(previousReads);
  expect(harness.dispatches).toHaveLength(1);
  expect(
    await harness.run(
      verifyRepaymentPilotResponse(
        {
          kind: "action",
          role: "approver",
          key: "original-payment-key",
          command: {
            id: review.repayment.id,
            version: review.repayment.version,
            action: "pay",
            note: "Independent invented repayment review",
          },
        },
        paid,
      ),
    ),
  ).toMatchObject({ repayment: { status: "paid" } });
  expect(JSON.stringify(repaymentPilotReport(paid))).not.toContain(
    "transactions",
  );
});

test("strict roles, consent, ownership, versions and original key association fail before dispatch", async () => {
  expect(
    (
      await harness.denied(
        createRepaymentOffer(harness.officer, {
          loan_id: harness.loanId,
          amount_minor: 100000,
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await harness.denied(
        createRepaymentOffer(harness.customer, {
          loan_id: harness.loanId,
          amount_minor: 1.5,
        }),
      )
    ).status,
  ).toBe(400);
  const preview = await harness.quote();
  expect(
    (
      await harness.denied(
        submitRepayment(
          harness.customer,
          { offer_id: preview.offer.id, consent: false },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await harness.denied(
        submitRepayment(
          { ...harness.customer, bank_id: "foreign-bank" },
          { offer_id: preview.offer.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(404);
  const d = await harness.run(
    submitRepayment(
      harness.customer,
      { offer_id: preview.offer.id, consent: true },
      "original-submit-key",
    ),
  );
  expect(
    (
      await harness.denied(
        submitRepayment(
          harness.customer,
          { offer_id: preview.offer.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await harness.denied(
        actOnRepayment(
          harness.approver,
          {
            id: d.repayment.id,
            version: 0,
            action: "recommend",
            note: "Wrong role review",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await harness.denied(
        actOnRepayment(
          harness.officer,
          {
            id: d.repayment.id,
            version: 99,
            action: "recommend",
            note: "Changed request version",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await harness.denied(
        savedRepaymentDetail(
          { ...harness.customer, bank_id: "foreign-bank" },
          d.repayment.id,
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await harness.denied(
        savedRepaymentForKey(harness.customer, "missing-original-key"),
      )
    ).uncertain,
  ).toBe(true);
  expect(harness.dispatches).toHaveLength(0);
});

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit reservation acknowledgement sends no Core write and cannot be replayed`, async () => {
    const d = await harness.recommended();
    harness.failStore = { phase: "reservation", when };
    const key = crypto.randomUUID();
    const input = {
      id: d.repayment.id,
      version: d.repayment.version,
      action: "pay",
      note: "Original reviewed payment",
    };
    expect(
      (await harness.denied(actOnRepayment(harness.approver, input, key)))
        .uncertain,
    ).toBe(true);
    expect(harness.dispatches).toHaveLength(0);
    harness.failStore = undefined;
    if (when === "after") {
      expect(
        (await harness.run(actOnRepayment(harness.approver, input, key)))
          .operation?.status,
      ).toBe("executing");
      const unresolved = await harness.run(
        inspectRepayment(harness.approver, d.repayment.id),
      );
      expect(unresolved.operation?.status).toBe("uncertain");
      expect(unresolved.actions).toEqual([]);
      expect(harness.dispatches).toHaveLength(0);
    } else
      expect(
        (await harness.denied(savedRepaymentForKey(harness.customer, key)))
          .status,
      ).toBe(404);
  });

for (const when of ["before", "after"] as const)
  test(`lost ${when}-commit outcome acknowledgement retains exactly one posting and original recovery`, async () => {
    const d = await harness.recommended();
    harness.failStore = { phase: "outcome", when };
    const key = crypto.randomUUID();
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
    expect(harness.balance).toBe(1900000);
    expect(harness.dispatches).toHaveLength(1);
    harness.failStore = undefined;
    let found = await harness.run(savedRepaymentForKey(harness.approver, key));
    if (when === "before") {
      expect(found.operation?.status).toBe("executing");
      found = await harness.run(
        inspectRepayment(harness.approver, d.repayment.id),
      );
    }
    expect(found.repayment.status).toBe("paid");
    expect(found.recorded_operation?.status).toBe("confirmed");
    expect(harness.dispatches).toHaveLength(1);
  });

test("a posted repayment with a lost reply remains locked through a balance refresh and confirms read-only after expiry", async () => {
  const d = await harness.recommended();
  harness.writerError = new BankingError({
    message: "Lost original reply",
    status: 503,
    uncertain: true,
  });
  harness.commitBeforeError = true;
  const unknown = await harness.act(d, "pay", harness.approver);
  expect(unknown.operation?.status).toBe("uncertain");
  expect(harness.balance).toBe(1900000);
  const bank = harness.db
    .query("SELECT * FROM banks WHERE id=?")
    .get(harness.customer.bank_id) as Bank;
  expect((await harness.run(financialView(bank, true))).stale).toBe(true);
  expect(() =>
    harness.db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('cash-race','loan-test-bank','cash-race-key','deposit','pending',10000,'Invented cash race','officer',51)",
    ),
  ).toThrow();
  harness.writerError = undefined;
  harness.time += 86400000;
  const confirmed = await harness.run(
    inspectRepayment(harness.approver, d.repayment.id),
  );
  expect(confirmed.repayment.status).toBe("paid");
  expect(confirmed.financial_view_stale).toBe(false);
  expect(harness.dispatches).toHaveLength(1);
  expect(harness.confirmations).toHaveLength(1);
  expect(harness.confirmations[0]).toEqual(harness.dispatches[0]);
  expect(confirmed.history.map((e) => e.operation_status)).toEqual([
    null,
    null,
    "executing",
    "uncertain",
    "confirmed",
  ]);
});

test("concurrent original and competing keys cannot dispatch twice, and another role cannot cancel a reserved payment", async () => {
  const d = await harness.recommended();
  let release: () => void = () => {};
  let began: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  harness.pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  harness.announce = began;
  const key = crypto.randomUUID(),
    input = {
      id: d.repayment.id,
      version: d.repayment.version,
      action: "pay",
      note: "Original racing payment",
    };
  const payment = harness.run(actOnRepayment(harness.approver, input, key));
  await started;
  expect(
    (await harness.run(actOnRepayment(harness.approver, input, key))).operation
      ?.status,
  ).toBe("executing");
  expect(
    (
      await harness.denied(
        actOnRepayment(harness.approver, input, crypto.randomUUID()),
      )
    ).status,
  ).toBe(409);
  const pending = await harness.run(
    savedRepaymentDetail(harness.customer, d.repayment.id),
  );
  expect(
    (
      await harness.denied(
        actOnRepayment(
          harness.customer,
          {
            id: d.repayment.id,
            version: pending.repayment.version,
            action: "cancel",
            note: "Racing cancellation",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  release();
  expect((await payment).repayment.status).toBe("paid");
  expect(harness.dispatches).toHaveLength(1);
});

test("definite failed original receipts survive a separately reviewed new attempt and expiry permits only cancellation", async () => {
  const d = await harness.recommended();
  const key = crypto.randomUUID();
  const input = {
    id: d.repayment.id,
    version: d.repayment.version,
    action: "pay",
    note: "Original definitely rejected payment",
  };
  harness.writerError = new BankingError({
    message: "Definite upstream rejection",
    status: 422,
    uncertain: false,
  });
  const failed = await harness.run(
    actOnRepayment(harness.approver, input, key),
  );
  expect(failed.recorded_operation?.status).toBe("failed");
  expect(harness.balance).toBe(2000000);
  harness.writerError = undefined;
  const paid = await harness.act(failed, "pay", harness.approver);
  expect(paid.repayment.status).toBe("paid");
  const replay = await harness.run(
    actOnRepayment(harness.approver, input, key),
  );
  expect(replay.operation?.status).toBe("confirmed");
  expect(replay.recorded_operation?.status).toBe("failed");
  expect(harness.dispatches).toHaveLength(2);
  const fresh = await harness.submit();
  harness.time += 900000;
  expect(
    (
      await harness.denied(
        actOnRepayment(
          harness.officer,
          {
            id: fresh.repayment.id,
            version: fresh.repayment.version,
            action: "recommend",
            note: "Expired offer review",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (await harness.act(fresh, "cancel", harness.customer)).repayment.status,
  ).toBe("cancelled");
});
