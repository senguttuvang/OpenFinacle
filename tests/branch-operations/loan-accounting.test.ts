import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { Session } from "../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { branchCustomer } from "../../src/platform/branch-operations/application/branch-day";
import { readLoanAccounting } from "../../src/platform/branch-operations/application/loan-accounting";
import {
  matchedLoanReceipt,
  matchedLoanTransaction,
} from "../../src/platform/branch-operations/domain/loan-accounting";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
const setup = async () => {
  const { h, source, recipientId } = await harness.twoCustomers(),
    officer = { ...source, role: "officer" as const };
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
    currency,
    status: { id: 300, value: "Active" },
    principal: 1000,
    summary: {
      currency,
      principalOutstanding: 1000,
      interestOutstanding: 0,
      feeChargesOutstanding: 0,
      penaltyChargesOutstanding: 0,
      totalOutstanding: 1000,
      totalOverdue: 0,
    },
    transactions: [
      {
        id: 81,
        type: { id: 1, value: "Disbursement" },
        currency,
        date: [2026, 11, 4],
        amount: 1000,
        manuallyReversed: false,
      },
    ],
  };
  const journal = {
    id: 901,
    officeId: 1,
    glAccountId: 2,
    glAccountName: "Loan portfolio",
    glAccountCode: "1201",
    transactionId: "L999-not-parsed",
    transactionDate: [2026, 11, 4],
    entryType: { id: 1, value: "DEBIT" },
    amount: 1000,
    currency: { code: "INR" },
    entityId: 7,
    entityType: { id: 1, value: "LOAN" },
    transactionDetails: { transactionId: 81 },
  };
  const product = {
    id: 3,
    name: "Native loan",
    accountingRule: { id: 2, value: "CASH BASED" },
    accountingMappings: {
      loanPortfolioAccount: { id: 2, name: "Loan portfolio" },
    },
  };
  let counterpart = false,
    total = 1;
  const calls: string[] = [];
  const layer = Layer.succeed(Core, {
    request: <T>(method: string, path: string) => {
      if (method !== "GET")
        return Effect.die("Accounting attempted Core write");
      calls.push(path);
      const result = path.startsWith("loans/7?")
        ? loan
        : path === "glaccounts"
          ? [{ id: 2, name: "Loan portfolio", glCode: "1201" }]
          : path === "loanproducts/3"
            ? product
            : path.startsWith("journalentries?loanId=7&")
              ? {
                  totalFilteredRecords: total,
                  pageItems: counterpart
                    ? [
                        journal,
                        {
                          ...journal,
                          id: 902,
                          entityId: 52,
                          entityType: { id: 2, value: "SAVING" },
                        },
                      ]
                    : total === 201 && path.includes("offset=0&")
                      ? Array.from({ length: 200 }, (_, index) => ({
                          ...journal,
                          id: 901 + index,
                        }))
                      : [journal],
                }
              : null;
      return Effect.succeed(result as T);
    },
  });
  const read = (offset = 0, session: Session = officer, id = recipientId) =>
    harness.run(
      h,
      readLoanAccounting(session, id, 7, offset).pipe(Effect.provide(layer)),
    );
  return {
    h,
    source,
    officer,
    recipientId,
    loan,
    journal,
    product,
    calls,
    read,
    counterpart: () => {
      counterpart = true;
      total = 2;
    },
    setTotal: (n: number) => {
      total = n;
    },
  };
};
test("owned loan GL/journal enquiry keeps explicit transaction references and never guesses provider labels", async () => {
  const f = await setup(),
    data = await f.read();
  expect(data.journals?.pageItems).toHaveLength(1);
  expect(data.product?.id).toBe(3);
  expect(
    matchedLoanTransaction(data, data.journals?.pageItems[0] ?? f.journal)?.id,
  ).toBe(81);
  f.journal.transactionDetails.transactionId = 999;
  const absent = await f.read();
  expect(
    matchedLoanTransaction(absent, absent.journals?.pageItems[0] ?? f.journal),
  ).toBeNull();
  expect(f.calls.some((p) => p.includes("transactionDetails=true"))).toBe(true);
});
test("foreign loan rows are withheld and linked savings counterparts are excluded with partial evidence", async () => {
  const f = await setup();
  f.counterpart();
  const partial = await f.read();
  expect(partial.coverage.sourceRows).toBe(2);
  expect(partial.coverage.excludedRows).toBe(1);
  expect(partial.journals?.pageItems).toHaveLength(1);
  f.journal.entityId = 8;
  expect((await f.read()).journals).toBeNull();
});
test("invalid currency/date and product identity never become accounting evidence", async () => {
  const f = await setup();
  f.journal.currency.code = "USD";
  expect((await f.read()).journals).toBeNull();
  f.journal.currency.code = "INR";
  f.journal.transactionDate = [2025, 2, 29];
  expect((await f.read()).journals).toBeNull();
  f.product.id = 99;
  expect((await f.read()).product).toBeNull();
});
test("staff/branch and offset guards precede Core reads; journal pagination remains loan-scoped", async () => {
  const f = await setup();
  await expect(f.read(0, { ...f.officer, role: "customer" })).rejects.toThrow(
    "staff",
  );
  await expect(f.read(0, f.officer, "foreign")).rejects.toThrow(
    "outside this branch",
  );
  await expect(f.read(-1)).rejects.toThrow("valid loan journal");
  expect(f.calls).toEqual([]);
  f.setTotal(201);
  expect((await f.read()).coverage.hasMore).toBe(true);
  await f.read(200);
  expect(f.calls).toContain(
    "journalentries?loanId=7&limit=200&offset=200&transactionDetails=true",
  );
});
test("receipt matching requires an unambiguous native transaction of the corresponding operation type", async () => {
  const f = await setup();
  const data = await f.read();
  const receipt = {
    kind: "disbursement" as const,
    recordId: "application",
    operationId: "operation",
    transactionId: 81,
    actor: "approver" as const,
    observedAt: 1,
    historyComplete: true,
    history: [],
  };
  const linked = {
    ...data,
    posting: { applicationId: "application", receipts: [receipt], errors: [] },
  };
  expect(matchedLoanReceipt(linked, 81)?.recordId).toBe("application");
  expect(
    matchedLoanReceipt(
      {
        ...linked,
        posting: { ...linked.posting, receipts: [receipt, receipt] },
      },
      81,
    ),
  ).toBeNull();
  expect(
    matchedLoanReceipt(
      {
        ...linked,
        posting: {
          ...linked.posting,
          receipts: [{ ...receipt, kind: "repayment" }],
        },
      },
      81,
    ),
  ).toBeNull();
});
