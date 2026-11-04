import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  createCommand,
  executeCommand,
} from "../../src/platform/banking-workspace/application/banking";
import {
  type BankingCommand,
  BankingError,
  type Session,
} from "../../src/platform/banking-workspace/domain/banking";
import { Core, Store } from "../../src/platform/banking-workspace/domain/ports";
import {
  branchCustomer,
  readBranchDay,
} from "../../src/platform/branch-operations/application/branch-day";
import { readRegisteredGl } from "../../src/platform/branch-operations/application/registered-gl";
import { exactCashInstruction } from "../../src/platform/branch-operations/domain/registered-gl";
import { createHarness } from "../customers/customer-banking.harness";

const harness = createHarness();
async function setup() {
  const { h, source, recipientId } = await harness.twoCustomers();
  const officer: Session = { ...source, role: "officer" };
  const selected = await harness.run(h, branchCustomer(officer, recipientId));
  const instruction = await harness.run(
    h,
    createCommand(
      selected.scoped,
      {
        kind: "deposit",
        amount: 1.25,
        description: "Synthetic owned GL cash instruction",
      },
      "registered-gl-original-cash",
    ),
  );
  const posted = await harness.run(
    h,
    executeCommand({ ...selected.scoped, role: "approver" }, instruction.id),
  );
  const day = await harness.run(h, readBranchDay(officer));
  const other = day.relationships.find((r) => r.customer.id !== recipientId);
  if (!other) throw Error("Other registered relationship missing");
  const row = {
    id: 800,
    officeId: 1,
    officeName: "Core office",
    glAccountId: 2,
    glAccountName: "Cash",
    glAccountCode: "OF1001",
    transactionId: "provider-not-an-ID",
    transactionDate: [2026, 11, 4],
    entryType: { id: 1, value: "CREDIT" },
    amount: 1.25,
    currency: { code: "INR", decimalPlaces: 2 },
    entityId: selected.customer.account_id,
    entityType: { id: 2, value: "SAVING" },
    transactionDetails: { transactionId: posted.core_id },
    manualEntry: false,
  };
  let page: unknown = { totalFilteredRecords: 1, pageItems: [row] },
    client: unknown = { id: selected.customer.client_id, officeId: 1 },
    gl: unknown = { id: 2, name: "Cash", glCode: "OF1001" };
  const owners = new Map<number, unknown>(),
    calls: { method: string; path: string }[] = [];
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string) => {
      calls.push({ method, path });
      const account = /^savingsaccounts\/(\d+)/.exec(path),
        loan = /^loans\/(\d+)/.exec(path);
      if (loan && !owners.has(Number(loan[1])))
        return Effect.fail(
          new BankingError({
            message: "Owner source unavailable",
            status: 503,
          }),
        );
      const result = account
        ? h.accounts.get(Number(account[1]))
        : loan
          ? owners.get(Number(loan[1]))
          : path.startsWith("clients/")
            ? client
            : path.startsWith("glaccounts/")
              ? gl
              : page;
      return Effect.succeed(result as T);
    },
  });
  return {
    row,
    other: other.customer,
    selected: selected.customer,
    posted,
    calls,
    source,
    officer,
    owners,
    foreign: () => {
      h.db.run(
        "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('foreign-bank','ready',999001,999002)",
      );
      h.db.run(
        "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          "foreign-id",
          "foreign-bank",
          "foreign-bank",
          "foreign-ref",
          "Synthetic foreign relationship",
          999001,
          999002,
          "999002",
          "seed",
          "active",
        ],
      );
    },
    unavailable: (id: number) => h.accounts.delete(id),
    page: (value: unknown) => {
      page = value;
    },
    client: (value: unknown) => {
      client = value;
    },
    gl: (value: unknown) => {
      gl = value;
    },
    limitedRead: async () => {
      const store = await harness.run(h, Store);
      const limited = Layer.succeed(Store, {
        ...store,
        all: <T>(sql: string, ...values: (string | number | null)[]) =>
          sql.includes("SELECT c.* FROM commands")
            ? Effect.succeed([
                posted,
                ...Array.from({ length: 5000 }, (_, i) => ({
                  ...posted,
                  id: `bounded-extra-${i}`,
                  key: `bounded-extra-${i}`,
                  core_id: null,
                  status: "pending" as const,
                })),
              ] as T[])
            : store.all<T>(sql, ...values),
      });
      return harness.run(
        h,
        readRegisteredGl(officer, recipientId, 2).pipe(
          Effect.provide(core),
          Effect.provide(limited),
        ),
      );
    },
    read: (
      offset = 0,
      session: Session = officer,
      id = recipientId,
      glId = 2,
    ) =>
      harness.run(
        h,
        readRegisteredGl(session, id, glId, offset).pipe(Effect.provide(core)),
      ),
    fail: (
      offset = 0,
      session: Session = officer,
      id = recipientId,
      glId = 2,
    ) =>
      harness.run(
        h,
        readRegisteredGl(session, id, glId, offset).pipe(
          Effect.provide(core),
          Effect.flip,
        ),
      ),
  };
}
test("GL rows across registered savings and independently owned loans preserve exact cash origin and hide other relationships", async () => {
  const s = await setup();
  s.owners.set(7, { id: 7, clientId: s.selected.client_id });
  s.owners.set(555, {
    id: 555,
    clientId: 999999,
    displayName: "FOREIGN PRIVATE",
  });
  const rows = [
    s.row,
    {
      ...s.row,
      id: 799,
      entityId: s.other.account_id,
      transactionDetails: null,
    },
    { ...s.row, id: 798, entityId: 7, entityType: { id: 1, value: "LOAN" } },
    {
      ...s.row,
      id: 797,
      entityId: 555,
      entityType: { id: 1, value: "LOAN" },
      amount: 424242.42,
      glAccountName: "FOREIGN PRIVATE",
    },
    { ...s.row, id: 796, entityId: 999999, glAccountName: "FOREIGN PRIVATE" },
    { ...s.row, id: 795, manualEntry: true },
    { ...s.row, id: 794, manualEntry: undefined },
    { ...s.row, id: 793, entityType: { id: 3, value: "Other" } },
  ];
  s.page({ totalFilteredRecords: rows.length, pageItems: rows });
  const v = await s.read();
  expect(v.rows.map((r) => [r.customerId, r.family, r.accountId])).toEqual([
    [s.selected.id, "Savings", s.selected.account_id],
    [s.other.id, "Savings", s.other.account_id],
    [s.selected.id, "Loan", 7],
  ]);
  expect(v.rows[0].originalCommandId).toBe(s.posted.id);
  expect(v.rows[1].originalCommandId).toBeNull();
  expect(v.rows[2].originalCommandId).toBeNull();
  expect(v.coverage).toMatchObject({
    sourceRows: 8,
    excludedRows: 5,
    eligibleAccounts: 2,
    hasMore: false,
    loanOwnershipFailures: 0,
  });
  expect(JSON.stringify(v)).not.toContain("FOREIGN PRIVATE");
  expect(JSON.stringify(v)).not.toContain("424242.42");
  expect(s.calls.every((c) => c.method === "GET")).toBe(true);
});
test("role, foreign branch relationship and invalid query fail before any Core reads", async () => {
  const s = await setup();
  expect(await s.fail(0, s.source)).toMatchObject({ status: 403 });
  expect(await s.fail(0, s.officer, "foreign")).toMatchObject({ status: 404 });
  expect(await s.fail(-1)).toMatchObject({ status: 400 });
  expect(await s.fail(0, s.officer, s.selected.id, 1.5)).toMatchObject({
    status: 400,
  });
  expect(s.calls).toEqual([]);
  s.foreign();
  expect(await s.fail(0, s.officer, "foreign-id")).toMatchObject({
    status: 404,
  });
  expect(s.calls).toEqual([]);
});
test("client or GL identity mismatch withholds the enquiry before journal reads", async () => {
  const s = await setup();
  s.client({ id: 999999, officeId: 1 });
  expect(await s.fail()).toMatchObject({ status: 503 });
  expect(s.calls.some((c) => c.path.startsWith("journalentries"))).toBe(false);
  s.client({ id: s.selected.client_id, officeId: 1 });
  s.gl({ id: 999, name: "Foreign", glCode: "BAD" });
  expect(await s.fail()).toMatchObject({ status: 503 });
  expect(s.calls.some((c) => c.path.startsWith("journalentries"))).toBe(false);
});
test("wrong office/GL, bad ordering, malformed money and inconsistent pages are never exposed", async () => {
  const s = await setup();
  for (const page of [
    { totalFilteredRecords: 1, pageItems: [{ ...s.row, officeId: 2 }] },
    { totalFilteredRecords: 1, pageItems: [{ ...s.row, glAccountId: 3 }] },
    { totalFilteredRecords: 2, pageItems: [s.row, { ...s.row, id: 801 }] },
    {
      totalFilteredRecords: 1,
      pageItems: [{ ...s.row, currency: { code: "USD" } }],
    },
    { totalFilteredRecords: 1, pageItems: [{ ...s.row, amount: 0.001 }] },
    { totalFilteredRecords: 201, pageItems: [s.row] },
    { totalFilteredRecords: 2, pageItems: [s.row, s.row] },
  ]) {
    s.page(page);
    expect(await s.fail()).toMatchObject({ status: 503 });
  }
});
test("loan/savings numeric namespaces cannot grant ownership, and failed lookup clears the row", async () => {
  const s = await setup(),
    loanId = s.selected.account_id;
  s.page({
    totalFilteredRecords: 1,
    pageItems: [
      { ...s.row, entityId: loanId, entityType: { id: 1, value: "LOAN" } },
    ],
  });
  const failed = await s.read();
  expect(failed.rows).toEqual([]);
  expect(failed.coverage.loanOwnershipFailures).toBe(1);
  s.owners.set(loanId, { id: loanId, clientId: 999999 });
  const foreign = await s.read();
  expect(foreign.rows).toEqual([]);
  expect(foreign.coverage.excludedRows).toBe(1);
  s.owners.set(loanId, { id: loanId, clientId: s.selected.client_id });
  const owned = await s.read();
  expect(owned.rows[0]).toMatchObject({
    family: "Loan",
    customerId: s.selected.id,
    originalCommandId: null,
  });
});
test("native loan ownership reads have a hard bound and explicit incomplete coverage", async () => {
  const s = await setup();
  const rows = Array.from({ length: 51 }, (_, i) => ({
    ...s.row,
    id: 2000 - i,
    entityId: 1000 + i,
    entityType: { id: 1, value: "LOAN" },
  }));
  for (let i = 0; i < 51; i++)
    s.owners.set(1000 + i, { id: 1000 + i, clientId: s.selected.client_id });
  s.page({ totalFilteredRecords: 51, pageItems: rows });
  const result = await s.read();
  expect(s.calls.filter((c) => c.path.startsWith("loans/"))).toHaveLength(50);
  expect(result.rows).toHaveLength(50);
  expect(result.coverage).toMatchObject({
    excludedRows: 1,
    loanOwnershipLimited: true,
  });
});
test("provider offsets count source rows before ownership exclusions", async () => {
  const s = await setup();
  s.page({
    totalFilteredRecords: 201,
    pageItems: Array.from({ length: 200 }, (_, i) => ({
      ...s.row,
      id: 4000 - i,
      ...(i === 199 ? { manualEntry: true } : {}),
    })),
  });
  const first = await s.read();
  expect(first.coverage).toMatchObject({
    offset: 0,
    sourceRows: 200,
    excludedRows: 1,
    hasMore: true,
  });
  expect(first.rows).toHaveLength(199);
  s.page({ totalFilteredRecords: 201, pageItems: [{ ...s.row, id: 3800 }] });
  const last = await s.read(200);
  expect(last.coverage).toMatchObject({
    offset: 200,
    sourceRows: 1,
    hasMore: false,
  });
  expect(s.calls.some((c) => c.path.includes("offset=200"))).toBe(true);
});
test("cash instruction matching rejects ambiguous, unposted, foreign and resource-only references", async () => {
  const s = await setup(),
    c = s.posted as BankingCommand,
    tx = c.core_id ?? 0;
  expect(exactCashInstruction([c], c.bank_id, c.account_id, tx)).toBe(c.id);
  for (const change of [
    { kind: "transfer" as const },
    { kind: "reverse" as const },
    { status: "pending" as const },
    { bank_id: "foreign" },
    { account_id: c.account_id + 1 },
  ])
    expect(
      exactCashInstruction([{ ...c, ...change }], c.bank_id, c.account_id, tx),
    ).toBeNull();
  expect(
    exactCashInstruction(
      [c, { ...c, id: "ambiguous" }],
      c.bank_id,
      c.account_id,
      tx,
    ),
  ).toBeNull();
  expect(
    exactCashInstruction([c], c.bank_id, c.account_id, undefined),
  ).toBeNull();
});

test("unavailable native account evidence excludes that relationship without hiding verified owned rows", async () => {
  const s = await setup();
  s.unavailable(s.other.account_id);
  s.page({
    totalFilteredRecords: 2,
    pageItems: [
      s.row,
      { ...s.row, id: 799, entityId: s.other.account_id, amount: 424242.42 },
    ],
  });
  const v = await s.read();
  expect(v.rows).toHaveLength(1);
  expect(v.rows[0].customerId).toBe(s.selected.id);
  expect(v.coverage).toMatchObject({
    eligibleAccounts: 1,
    loadedCustomers: 2,
    registryLimited: true,
    excludedRows: 1,
  });
  expect(JSON.stringify(v)).not.toContain("424242.42");
});

test("incomplete saved workflow coverage withholds all original instruction links", async () => {
  const s = await setup();
  const v = await s.limitedRead();
  expect(v.rows).toHaveLength(1);
  expect(v.rows[0].originalCommandId).toBeNull();
  expect(v.coverage.workflowLimited).toBe(true);
  expect(v.errors.join(" ")).toContain("Original instruction links withheld");
});

test("registered GL retains owned native computation flags without exposing stored book amounts", async () => {
  const f = await setup();
  f.page({
    totalFilteredRecords: 1,
    pageItems: [
      {
        ...f.row,
        runningBalanceComputed: false,
        officeRunningBalance: 0,
        organizationRunningBalance: 0,
      },
    ],
  });
  const value = await f.read();
  expect(value.rows).toHaveLength(1);
  expect(value.rows[0].journal.runningBalanceComputed).toBe(false);
  expect("officeRunningBalance" in value.rows[0].journal).toBe(false);
  expect("organizationRunningBalance" in value.rows[0].journal).toBe(false);
  expect(
    f.calls
      .filter((c) => c.path.startsWith("journalentries?"))
      .every(
        (c) => c.method === "GET" && c.path.includes("runningBalance=true"),
      ),
  ).toBe(true);
  f.page({
    totalFilteredRecords: 1,
    pageItems: [{ ...f.row, currency: { code: "INR", decimalPlaces: 3 } }],
  });
  await expect(f.read()).rejects.toThrow("Native GL evidence");
});
