import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  createCommand,
  executeCommand,
} from "../../src/platform/banking-workspace/application/banking";
import { BankingError } from "../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../src/platform/banking-workspace/domain/ports";
import { readAccounting } from "../../src/platform/branch-operations/application/accounting";
import {
  assignResponsibility,
  branchCustomer,
  readBranchDay,
} from "../../src/platform/branch-operations/application/branch-day";
import { branchTotals } from "../../src/platform/branch-operations/domain/branch-day";
import { branchRoutes } from "../../src/runtime/http/routes/branch-routes";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
test("one branch day joins multiple customers and preserves maker/checker, repeat and original approval semantics", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const checker = { ...source, role: "approver" as const };
  const target = await harness.run(h, branchCustomer(officer, recipientId));
  const input = {
    kind: "deposit" as const,
    amount: 125.25,
    description: "Cash received for second customer",
  };
  const postsBefore = h.calls.filter(
    (c) => c.method === "POST" && c.path.includes("command=deposit"),
  ).length;
  const original = await harness.run(
    h,
    createCommand(target.scoped, input, "branch-day-cash-original"),
  );
  expect(
    (
      await harness.run(
        h,
        createCommand(target.scoped, input, "branch-day-cash-original"),
      )
    ).id,
  ).toBe(original.id);
  expect(
    await harness.run(
      h,
      executeCommand(target.scoped, original.id).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 403 });
  const approve = () =>
    branchRoutes(
      new Request("https://example.test/api/branch/decision", {
        method: "POST",
        body: JSON.stringify({
          customerId: recipientId,
          commandId: original.id,
          decision: "approve",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      checker,
    );
  expect((await harness.run(h, approve()))?.status).toBe(200);
  const day: import("../../src/platform/branch-operations/domain/branch-day").BranchDay =
    await harness.run(h, readBranchDay(officer));
  expect(day.relationships).toHaveLength(2);
  expect(
    day.relationships.find((r) => r.customer.id === recipientId)?.commands[0],
  ).toMatchObject({ id: original.id, status: "posted" });
  expect(branchTotals(day).complete).toBe(true);
  expect(day.branchId).toBe("branch");
  expect(
    h.calls.filter(
      (c) => c.method === "POST" && c.path.includes("command=deposit"),
    ),
  ).toHaveLength(postsBefore + 1);
});
test("customer and foreign branch scopes cannot read, decide or assign branch work", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  expect(
    await harness.run(h, readBranchDay(source).pipe(Effect.flip)),
  ).toMatchObject({ status: 403 });
  const officer = { ...source, role: "officer" as const };
  expect(
    await harness.run(
      h,
      branchCustomer(officer, "foreign-customer").pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
  expect(
    await harness.run(
      h,
      assignResponsibility(
        officer,
        recipientId,
        "foreign-command",
        "manager",
        0,
      ).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 404 });
});
test("responsibility is persistent, versioned, and rejects competing stale assignment", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const target = await harness.run(h, branchCustomer(officer, recipientId));
  const command = await harness.run(
    h,
    createCommand(
      target.scoped,
      { kind: "withdrawal", amount: 10 },
      "branch-owner-instruction",
    ),
  );
  expect(
    await harness.run(
      h,
      assignResponsibility(officer, recipientId, command.id, "teller", 0),
    ),
  ).toMatchObject({ owner: "teller", version: 1 });
  const results = await Promise.all(
    ["manager", "accountant"].map((owner) =>
      harness.run(
        h,
        assignResponsibility(
          officer,
          recipientId,
          command.id,
          owner as "manager" | "accountant",
          1,
        ).pipe(Effect.either),
      ),
    ),
  );
  expect(results.filter((r) => r._tag === "Right")).toHaveLength(1);
  expect(results.filter((r) => r._tag === "Left")).toHaveLength(1);
  expect(
    (await harness.run(h, readBranchDay(officer))).responsibilities[0].version,
  ).toBe(2);
  expect(
    await harness.run(
      h,
      assignResponsibility(officer, recipientId, command.id, "checker", 0).pipe(
        Effect.flip,
      ),
    ),
  ).toMatchObject({ status: 409 });
});
test("missing and non-INR account evidence withholds aggregate and malformed accounting remains explicit", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const day: import("../../src/platform/branch-operations/domain/branch-day").BranchDay =
    await harness.run(h, readBranchDay(officer));
  const account = day.relationships[0].account;
  expect(account).not.toBeNull();
  if (!account) throw new Error("Fixture account missing");
  account.currency = { code: "USD", decimalPlaces: 2 };
  expect(branchTotals(day).complete).toBe(false);
  day.relationships[0].account = null;
  expect(branchTotals(day).complete).toBe(false);
  const evidence = await harness.run(h, readAccounting(officer, recipientId));
  expect(evidence.errors.length).toBeGreaterThan(0);
  expect(evidence.journals).toBeNull();
});
test("core read failure preserves relationship with an error and no invented balance", async () => {
  const { h, source } = await harness.twoCustomers();
  const effect = readBranchDay({ ...source, role: "officer" }).pipe(
    Effect.provide(
      Layer.succeed(Core, {
        request: () =>
          Effect.fail(
            new BankingError({ message: "Core unavailable", status: 503 }),
          ),
      }),
    ),
  );
  const day: import("../../src/platform/branch-operations/domain/branch-day").BranchDay =
    await harness.run(h, effect);
  expect(
    day.relationships.every(
      (r) => r.account === null && r.error === "Core unavailable",
    ),
  ).toBe(true);
  expect(branchTotals(day).complete).toBe(false);
});
test("daily totals exclude reversed and other-day entries without interpreting internal credits as cash", async () => {
  const { h, source } = await harness.twoCustomers();
  const day: import("../../src/platform/branch-operations/domain/branch-day").BranchDay =
    await harness.run(h, readBranchDay({ ...source, role: "officer" }));
  const account = day.relationships[0].account;
  if (!account) throw new Error("Fixture account missing");
  const date = day.businessDate.split("-").map(Number);
  account.transactions = [
    {
      id: 1,
      amount: 15.01,
      date,
      transactionType: { value: "Deposit", deposit: true },
    },
    {
      id: 2,
      amount: 9,
      date,
      reversed: true,
      transactionType: { value: "Deposit", deposit: true },
    },
    {
      id: 3,
      amount: 20,
      date: [2020, 1, 1],
      transactionType: { value: "Deposit", deposit: true },
    },
  ];
  for (const relationship of day.relationships.slice(1))
    if (relationship.account) relationship.account.transactions = [];
  expect(branchTotals(day).creditsMinor).toBe(1501);
});
test("accounting reads real API shapes, retains explicit transaction reference and rejects foreign subledger rows", async () => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer = { ...source, role: "officer" as const };
  const target = await harness.run(h, branchCustomer(officer, recipientId));
  const account = h.accounts.get(target.customer.account_id);
  if (!account) throw new Error("Missing fixture account");
  let foreign = false;
  const paths: string[] = [];
  const fixture = Layer.succeed(Core, {
    request: <T>(_method: string, path: string) => {
      paths.push(path);
      const journal = {
        id: 81,
        officeId: 1,
        glAccountId: 2,
        glAccountName: "Deposits",
        glAccountCode: "OF2001",
        transactionId: "S901",
        transactionDate: [2026, 11, 3],
        entryType: { id: 1, value: "CREDIT" },
        amount: 125.25,
        currency: { code: "INR" },
        entityId: foreign ? 999999 : account.id,
        entityType: { id: 2, value: "SAVING" },
        transactionDetails: { transactionId: 901 },
      };
      const result = path.startsWith("savingsaccounts/")
        ? account
        : path === "glaccounts"
          ? [{ id: 2, name: "Deposits", glCode: "OF2001" }]
          : path.startsWith("journalentries?")
            ? { totalFilteredRecords: 1, pageItems: [journal] }
            : {
                id: 1,
                name: "Savings",
                accountingRule: { id: 2, value: "Cash based" },
                accountingMappings: {
                  savingsControlAccount: { id: 2, name: "Deposits" },
                },
              };
      return Effect.succeed(result as T);
    },
  });
  const read = () =>
    harness.run(
      h,
      readAccounting(officer, recipientId).pipe(Effect.provide(fixture)),
    );
  const result = await read();
  expect(paths).toContain(
    `journalentries?savingsId=${account.id}&limit=200&offset=0&transactionDetails=true`,
  );
  expect(result.journals?.pageItems[0].transactionDetails?.transactionId).toBe(
    901,
  );
  expect(result.product?.accountingMappings?.savingsControlAccount.id).toBe(2);
  expect(result.errors).toEqual([]);
  foreign = true;
  const invalid = await read();
  expect(invalid.journals).toBeNull();
  expect(invalid.errors).toContain(
    "Core returned a different subledger. Journal evidence withheld.",
  );
});
test("branch response validation rejects absent collections before rendering staff enquiry", async () => {
  const { Schema } = await import("effect");
  const { BranchDayEnvelope } = await import(
    "../../src/platform/branch-operations/domain/core-account"
  );
  expect(Schema.decodeUnknownEither(BranchDayEnvelope)({})._tag).toBe("Left");
  const { h, source } = await harness.twoCustomers();
  const day = await harness.run(
    h,
    readBranchDay({ ...source, role: "officer" }),
  );
  expect(Schema.decodeUnknownEither(BranchDayEnvelope)(day)._tag).toBe("Right");
});
