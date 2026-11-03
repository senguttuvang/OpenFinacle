import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  BankingError,
  type Session,
} from "../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { branchCustomer } from "../../src/platform/branch-operations/application/branch-day";
import {
  readBranchLoan,
  readLoanExposure,
} from "../../src/platform/branch-operations/application/loans";
import { loanExposureTotals } from "../../src/platform/branch-operations/domain/loans";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
const setup = async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer: Session = { ...source, role: "officer" };
  const { customer } = await harness.run(
    h,
    branchCustomer(officer, recipientId),
  );
  const currency = { code: "INR", decimalPlaces: 2 };
  const loan = {
    id: 7,
    clientId: customer.client_id,
    accountNo: "LOAN7",
    loanProductId: 3,
    loanProductName: "Native loan product",
    currency,
    status: { id: 300, value: "Active" },
    principal: 1000,
    summary: {
      currency,
      principalOutstanding: 1000,
      interestOutstanding: 20,
      feeChargesOutstanding: 0,
      penaltyChargesOutstanding: 0,
      totalOutstanding: 1020,
      totalOverdue: 0,
    },
    repaymentSchedule: {
      currency,
      periods: [
        { dueDate: [2026, 11, 4], principalDisbursed: 1000 },
        {
          period: 1,
          dueDate: [2026, 12, 4],
          principalDue: 100,
          interestDue: 20,
          totalDueForPeriod: 120,
          totalPaidForPeriod: 0,
          totalOutstandingForPeriod: 120,
        },
      ],
    },
    transactions: [
      {
        id: 17,
        type: { id: 1, value: "Disbursement" },
        date: [2026, 11, 4],
        amount: 1000,
        currency,
        manuallyReversed: false,
      },
    ],
    secret: "private",
  };
  const calls: string[] = [];
  let wrongClient = false,
    limited = false,
    broken = false,
    duplicate = false;
  const layer = Layer.succeed(Core, {
    request: <T>(method: string, path: string) => {
      if (method !== "GET")
        return Effect.die("Loan enquiry dispatched a write");
      calls.push(path);
      if (broken)
        return Effect.fail(
          new BankingError({ message: "private Core failure", status: 503 }),
        );
      const row = { ...loan, clientId: wrongClient ? 999999 : loan.clientId };
      return Effect.succeed(
        (path.startsWith("loans/7?")
          ? row
          : {
              totalFilteredRecords: path.includes(
                `clientId=${customer.client_id}&`,
              )
                ? duplicate
                  ? 2
                  : limited
                    ? 51
                    : 1
                : 0,
              pageItems: path.includes(`clientId=${customer.client_id}&`)
                ? duplicate
                  ? [row, row]
                  : [row]
                : [],
            }) as T,
      );
    },
  });
  const exposure = (session = officer, id = recipientId) =>
    harness.run(h, readLoanExposure(session, id).pipe(Effect.provide(layer)));
  const detail = (session = officer, id = recipientId, loanId = 7) =>
    harness.run(
      h,
      readBranchLoan(session, id, loanId).pipe(Effect.provide(layer)),
    );
  return {
    h,
    officer,
    recipientId,
    loan,
    calls,
    exposure,
    detail,
    setDuplicate: () => {
      duplicate = true;
    },
    setWrong: () => {
      wrongClient = true;
    },
    setLimited: () => {
      limited = true;
    },
    setBroken: () => {
      broken = true;
    },
  };
};
test("registered-client loan exposure sums native principal/total separately and strips diagnostics", async () => {
  const f = await setup();
  const data = await f.exposure();
  expect(data.complete).toBe(true);
  expect(data.coverage.loadedCustomers).toBe(data.coverage.totalCustomers);
  expect(data.rows).toHaveLength(1);
  expect(loanExposureTotals(data)).toEqual([
    {
      id: 3,
      name: "Native loan product",
      loans: 1,
      principalMinor: 100000,
      totalMinor: 102000,
    },
  ]);
  expect(JSON.stringify(data)).not.toContain("private");
  expect(f.calls.every((p) => p.startsWith("loans?clientId="))).toBe(true);
});
test("foreign-client loan rows are withheld even when the upstream client filter is ignored", async () => {
  const f = await setup();
  f.setWrong();
  const data = await f.exposure();
  expect(data.rows).toEqual([]);
  expect(data.complete).toBe(false);
  expect(loanExposureTotals(data)).toBeNull();
  await expect(f.detail()).rejects.toThrow("ownership");
});
test("capped pages and failed sources withhold product totals instead of implying zero", async () => {
  const f = await setup();
  f.setLimited();
  expect(loanExposureTotals(await f.exposure())).toBeNull();
  f.setBroken();
  const data = await f.exposure();
  expect(data.coverage.reportedLoans).toBeNull();
  expect(data.complete).toBe(false);
  expect(data.errors.length).toBeGreaterThan(0);
  expect(JSON.stringify(data)).not.toContain("private Core failure");
});
test("staff, branch and positive loan identity are checked before Core reads", async () => {
  const f = await setup();
  await expect(f.exposure({ ...f.officer, role: "customer" })).rejects.toThrow(
    "staff",
  );
  await expect(f.detail(f.officer, "foreign-customer")).rejects.toThrow(
    "outside this branch",
  );
  await expect(f.detail(f.officer, f.recipientId, NaN)).rejects.toThrow(
    "valid Core loan",
  );
  expect(f.calls).toEqual([]);
});
test("owned native schedules preserve funding versus instalment lines and posted transaction references", async () => {
  const f = await setup();
  const data = await f.detail();
  expect(data.loan.repaymentSchedule?.periods.map((p) => p.sourceLine)).toEqual(
    [1, 2],
  );
  expect(data.loan.repaymentSchedule?.periods[0].principalDue).toBeUndefined();
  expect(data.loan.transactions?.[0].id).toBe(17);
  expect(JSON.stringify(data)).not.toContain("private");
  f.loan.repaymentSchedule.periods[1].dueDate = [2025, 2, 29];
  await expect(f.detail()).rejects.toThrow("invalid");
});
test("currency and missing/unsafe monetary evidence cannot create a complete aggregate", async () => {
  const f = await setup();
  f.loan.summary.currency.code = "USD";
  expect(loanExposureTotals(await f.exposure())).toBeNull();
  f.loan.summary.currency.code = "INR";
  f.loan.summary.totalOutstanding = 1020.001;
  expect(loanExposureTotals(await f.exposure())).toBeNull();
});
test("missing loan summary remains unavailable while explicit native zeros remain zero", async () => {
  const f = await setup();
  for (const key of [
    "principalOutstanding",
    "interestOutstanding",
    "feeChargesOutstanding",
    "penaltyChargesOutstanding",
    "totalOutstanding",
    "totalOverdue",
  ] as const)
    f.loan.summary[key] = 0;
  expect(loanExposureTotals(await f.exposure())?.[0].principalMinor).toBe(0);
  Object.defineProperty(f.loan, "summary", {
    value: undefined,
    writable: true,
  });
  const data = await f.exposure();
  expect(data.rows).toHaveLength(1);
  expect(data.rows[0].loan.summary).toBeUndefined();
  expect(data.complete).toBe(false);
  expect(loanExposureTotals(data)).toBeNull();
});
test("loan exposure covers at most200 registered clients and withholds totals beyond capacity", async () => {
  const f = await setup();
  const count = f.h.db
    .query("SELECT count(*) AS total FROM customers WHERE status='active'")
    .get() as { total: number };
  for (let i = count.total; i < 201; i++) {
    const bank = `capacity-loan-${i}`,
      id = 10000 + i;
    f.h.db.run(
      "INSERT INTO banks(id,status,customer_client,customer_account) VALUES(?,'ready',?,?)",
      [bank, id, id],
    );
    const branch = f.h.db
      .query("SELECT branch_id FROM customers WHERE id=?")
      .get(f.recipientId) as { branch_id: string };
    f.h.db.run(
      "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES(?,?,?,?,?,?,?,?,'seed','active')",
      [
        bank,
        branch.branch_id,
        bank,
        bank,
        `Synthetic capacity ${i}`,
        id,
        id,
        String(id),
      ],
    );
  }
  const data = await f.exposure();
  expect(data.coverage.loadedCustomers).toBe(200);
  expect(data.coverage.totalCustomers).toBe(201);
  expect(data.coverage.limited).toBe(true);
  expect(f.calls).toHaveLength(200);
  expect(loanExposureTotals(data)).toBeNull();
});
test("duplicate Core loan and transaction identifiers withhold evidence", async () => {
  const f = await setup();
  f.setDuplicate();
  const report = await f.exposure();
  expect(report.rows).toEqual([]);
  expect(loanExposureTotals(report)).toBeNull();
  f.loan.transactions.push({ ...f.loan.transactions[0] });
  await expect(f.detail()).rejects.toThrow("invalid");
});
test("foreign registered branch relationships are denied before loan reads", async () => {
  const f = await setup();
  f.h.db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('foreign-loan-bank','ready',999998,999998)",
  );
  f.h.db.run(
    "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES('foreign-loan-client','foreign-loan-bank','foreign-loan-bank','foreign-loan-ref','Synthetic foreign loan client',999998,999998,'999998','seed','active')",
  );
  await expect(f.exposure(f.officer, "foreign-loan-client")).rejects.toThrow(
    "outside this branch",
  );
  await expect(f.detail(f.officer, "foreign-loan-client")).rejects.toThrow(
    "outside this branch",
  );
  expect(f.calls).toEqual([]);
});
