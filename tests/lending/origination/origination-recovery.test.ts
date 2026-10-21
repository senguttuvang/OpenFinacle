import { expect, test } from "bun:test";
import { financialView } from "../../../src/platform/banking-workspace/application/financial-view";
import { BankingError } from "../../../src/platform/banking-workspace/domain/banking";
import {
  actOnLoan,
  createLoanQuote,
  inspectOriginalLoan,
  submitLoanApplication,
} from "../../../src/platform/lending/application/loan-origination";
import { savedLoanDetail } from "../../../src/platform/lending/application/loan-records";
import { workflowQuote } from "../../fixtures/loan-workflow";
import { createHarness } from "./loan-origination.harness";

const harness = createHarness();
test("cash winning after read prevents reservation/dispatch and reservation winning blocks cancellation until original outcome", async () => {
  const detail = await harness.recommend();
  harness.beforeWrite = (sql) => {
    if (!sql.startsWith("INSERT INTO loan_operations")) return;
    harness.beforeWrite = undefined;
    harness.db.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id) VALUES('cash-race','loan-test-bank','cash-original','deposit','executing',10000,'Invented','officer',51)",
    );
  };
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.approver,
          {
            id: detail.loan.id,
            version: detail.loan.version,
            action: "register",
            note: "Invented registration",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  expect(harness.dispatches).toHaveLength(0);
  harness.db.run("UPDATE commands SET status='failed' WHERE id='cash-race'");
  let release: () => void = () => {};
  let started: () => void = () => {};
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  harness.pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  harness.announce = started;
  const request = harness.act(detail, "register", harness.approver);
  await began;
  const pending = await harness.run(
    savedLoanDetail(harness.customer, detail.loan.id),
  );
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.customer,
          {
            id: detail.loan.id,
            version: pending.loan.version,
            action: "cancel",
            note: "Racing cancellation",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(403);
  release();
  expect((await request).loan.status).toBe("registered");
  expect(harness.dispatches).toHaveLength(1);
});

test("day rollover blocks funding while explicit customer withdrawal requires separate undo and terminal Core withdrawal", async () => {
  let detail = await harness.approved();
  harness.time = Date.parse("2026-10-18T09:00:00Z");
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.approver,
          {
            id: detail.loan.id,
            version: detail.loan.version,
            action: "disburse",
            note: "Stale funding",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  detail = await harness.act(detail, "request_withdrawal", harness.customer);
  expect(detail.actions).toEqual([]);
  detail = await harness.act(detail, "undo_approval", harness.approver);
  expect(detail.loan).toMatchObject({
    status: "registered",
    withdrawal_requested: true,
  });
  detail = await harness.act(detail, "withdraw", harness.approver);
  expect(detail.loan.status).toBe("withdrawn");
  expect(harness.balanceMinor).toBe(500000);
  expect(harness.dispatches.map((i) => i.action)).toEqual([
    "register",
    "approve",
    "undo_approval",
    "withdraw",
  ]);
});

test("an earlier definite failed reference stays failed after a fresh successful attempt, regardless of JSON field order", async () => {
  const detail = await harness.recommend();
  const key = crypto.randomUUID();
  const request = {
    id: detail.loan.id,
    version: detail.loan.version,
    action: "register",
    note: "Original reviewed registration",
  };
  harness.writerFailure = new BankingError({
    message: "Definite Core rejection",
    status: 422,
  });
  const failed = await harness.run(actOnLoan(harness.approver, request, key));
  expect(failed.recorded_operation?.status).toBe("failed");
  harness.writerFailure = undefined;
  const success = await harness.act(failed, "register", harness.approver);
  expect(success.loan.status).toBe("registered");
  const original = await harness.run(
    actOnLoan(
      harness.approver,
      {
        note: request.note,
        action: request.action,
        version: request.version,
        id: request.id,
      },
      key,
    ),
  );
  expect(original.loan.status).toBe("registered");
  expect(original.operation?.status).toBe("confirmed");
  expect(original.recorded_operation?.status).toBe("failed");
  expect(original.recorded_operation?.key).toBe(key);
  expect(harness.dispatches).toHaveLength(2);
  expect(harness.coreState.size).toBe(1);
});

test("a disbursement that completed before an ambiguous reply remains locked until positive original proof", async () => {
  const detail = await harness.approved();
  harness.writerFailure = new BankingError({
    message: "Reply lost after original commit",
    status: 503,
    uncertain: true,
  });
  harness.commitBeforeFailure = true;
  const pending = await harness.act(detail, "disburse", harness.approver);
  expect(pending.loan.status).toBe("approved");
  expect(pending.operation?.status).toBe("uncertain");
  expect(harness.balanceMinor).toBe(1700000);
  const read = await harness.run(financialView(harness.bank(), true));
  expect(read.account?.summary?.accountBalance).toBe(17000);
  expect(read.stale).toBe(true);
  harness.writerFailure = undefined;
  harness.time += 1000;
  const confirmed = await harness.run(
    inspectOriginalLoan(harness.approver, detail.loan.id),
  );
  expect(confirmed.loan.status).toBe("active");
  expect(confirmed.financial_view_stale).toBe(false);
  expect(harness.balanceMinor).toBe(1700000);
  expect(
    harness.dispatches.filter((i) => i.action === "disburse"),
  ).toHaveLength(1);
});

test("unaffordable or expired offers cannot be accepted or recommended and cancellation permits a fresh quote", async () => {
  const poor = await harness.run(
    createLoanQuote(harness.customer, {
      ...workflowQuote.terms,
      monthly_income: 5000,
      monthly_commitments: 1000,
      monthly_expenses: 3000,
    }),
  );
  expect(poor.affordability.within_declared_surplus).toBe(false);
  expect(
    (
      await harness.denied(
        submitLoanApplication(
          harness.customer,
          { quote_id: poor.quote.id, consent: true },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(400);
  const submitted = await harness.apply();
  harness.time += 900000;
  expect(
    (
      await harness.denied(
        actOnLoan(
          harness.officer,
          {
            id: submitted.loan.id,
            version: submitted.loan.version,
            action: "recommend",
            note: "Expired assessment",
          },
          crypto.randomUUID(),
        ),
      )
    ).status,
  ).toBe(409);
  const cancelled = await harness.act(submitted, "cancel", harness.customer);
  expect(cancelled.loan.status).toBe("cancelled");
  const fresh = await harness.apply();
  expect(fresh.loan.status).toBe("submitted");
  expect(fresh.quote.id).not.toBe(submitted.quote.id);
  expect(harness.dispatches).toHaveLength(0);
});

test("registered withdrawal is a separate verified instruction with no approval or funding", async () => {
  let detail = await harness.act(
    await harness.recommend(),
    "register",
    harness.approver,
  );
  detail = await harness.act(detail, "request_withdrawal", harness.customer);
  detail = await harness.act(detail, "withdraw", harness.approver);
  expect(detail.loan.status).toBe("withdrawn");
  expect(harness.dispatches.map((i) => i.action)).toEqual([
    "register",
    "withdraw",
  ]);
  expect(harness.balanceMinor).toBe(500000);
});
