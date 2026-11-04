import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { resumeCustomerSeed } from "../../src/demo/customers/customer-provisioning";
import { createCommand } from "../../src/platform/banking-workspace/application/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { readAccounting } from "../../src/platform/branch-operations/application/accounting";
import { readBranchDay } from "../../src/platform/branch-operations/application/branch-day";
import {
  registerCustomer,
  registerLegacyCustomer,
} from "../../src/platform/customers/application/customer-registry";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
test("complete existing 101-customer branch coverage retains isolation and source accounts", async () => {
  const { h, source } = await harness.twoCustomers();
  for (let start = 1; start <= 100; start += 10)
    await harness.run(h, resumeCustomerSeed("branch", start, 10));
  const model = h.accounts.get(14);
  if (!model) throw new Error("Fixture account missing");
  h.accounts.set(15, {
    ...model,
    id: 15,
    clientId: 5,
    clientName: "Later Customer",
    accountNo: "SYN00015",
    externalId: "later-account",
  });
  h.db.run(
    "INSERT INTO banks(id,journey,status,customer_client,customer_account,recipient_client,recipient_account,employer_client,employer_account) VALUES('later-scope','existing','ready',5,15,2,12,3,13)",
  );
  await harness.run(
    h,
    registerCustomer({
      id: "later",
      branch_id: "branch",
      bank_id: "later-scope",
      reference: "OPEN-LATER",
      display_name: "Later Customer",
      client_id: 5,
      account_id: 15,
      account_no: "SYN00015",
      origin: "onboarding",
    }),
  );
  await harness.run(h, registerLegacyCustomer("other"));
  await harness.run(
    h,
    createCommand(
      { ...harness.session("other"), role: "officer" },
      { kind: "deposit", amount: 20 },
      "foreign-branch-deposit",
    ),
  );
  const day = await harness.run(
    h,
    readBranchDay({ ...source, role: "officer" }),
  );
  expect(day.relationships).toHaveLength(101);
  expect(day.coverage.totalCustomers).toBe(101);
  expect(day.truncated).toBe(false);
  expect(
    day.relationships.every(
      (r) =>
        r.customer.branch_id === "branch" &&
        r.account?.id === r.customer.account_id &&
        r.commands.every((c) => c.bank_id !== "other"),
    ),
  ).toBe(true);
  expect(day.relationships.filter((r) => r.error)).toEqual([]);
});
test("mixed native counterpart row is excluded without hiding owned savings journals; page offsets stay scoped", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const initial = await harness.run(
    h,
    readBranchDay({ ...source, role: "officer" }),
  );
  const account = initial.relationships.find(
    (r) => r.customer.id === recipientId,
  )?.account;
  if (!account) throw new Error("Fixture account missing");
  const paths: string[] = [];
  const fixture = Layer.succeed(Core, {
    request: <T>(_method: string, path: string) => {
      paths.push(path);
      const row = {
        id: 1,
        officeId: 1,
        glAccountId: 2,
        glAccountName: "Deposits",
        glAccountCode: "OF2001",
        transactionId: "S286",
        transactionDate: [2026, 11, 3],
        entryType: { id: 1, value: "CREDIT" },
        amount: 12,
        currency: { code: "INR", decimalPlaces: 2 },
        entityId: account.id,
        entityType: { id: 2, value: "SAVING" },
        transactionDetails: { transactionId: 286 },
      };
      const result = path.startsWith("savingsaccounts/")
        ? { ...account, savingsProductId: 1 }
        : path === "glaccounts"
          ? []
          : path.startsWith("journalentries?")
            ? {
                totalFilteredRecords: 202,
                pageItems: [
                  row,
                  { ...row, id: 2, entityType: { id: 1, value: "LOAN" } },
                ],
              }
            : {
                id: 1,
                name: "Savings",
                accountingRule: { id: 2, value: "Cash based" },
              };
      return Effect.succeed(result as T);
    },
  });
  const officer = { ...source, role: "officer" as const };
  const evidence = await harness.run(
    h,
    readAccounting(officer, recipientId, 200).pipe(Effect.provide(fixture)),
  );
  expect(paths).toContain(
    `journalentries?savingsId=${account.id}&limit=200&offset=200&transactionDetails=true&runningBalance=true`,
  );
  expect(evidence.journals?.pageItems).toHaveLength(1);
  expect(evidence.journals?.pageItems[0].entityType?.id).toBe(2);
  expect(evidence.coverage).toEqual({
    offset: 200,
    limit: 200,
    sourceRows: 2,
    excludedRows: 1,
    hasMore: false,
  });
  expect(evidence.errors[0]).toContain("Excluded 1 counterpart");
  const calls = paths.length;
  expect(
    await harness.run(
      h,
      readAccounting(officer, recipientId, -1).pipe(
        Effect.provide(fixture),
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 400 });
  expect(paths).toHaveLength(calls);
});
