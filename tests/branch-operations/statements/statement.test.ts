import { expect, test } from "bun:test";
import { Effect } from "effect";
import { readSavingsStatement } from "../../../src/platform/branch-operations/application/savings-statement";
import { branchRoutes } from "../../../src/runtime/http/routes/branch-routes";
import { setupStatement } from "./statement.harness";

test("owned native page preserves explicit zero and strips private native transaction fields", async () => {
  const f = await setupStatement(),
    value = await f.read();
  expect(value).toMatchObject({
    branchId: "branch",
    customerId: f.recipientId,
    total: 1,
    pageSize: 200,
    account: {
      id: f.account.id,
      clientId: f.account.clientId,
      accountNo: f.account.accountNo,
    },
  });
  expect(value.rows[0].runningBalance).toBe(0);
  expect(value.rows[0].reversed).toBe(false);
  expect(JSON.stringify(value)).not.toContain("private");
  expect(JSON.stringify(value)).not.toContain("submittedByUsername");
  expect(f.calls).toHaveLength(2);
});
test("inclusive native dates and page-number semantics preserve all source rows in full-range export", async () => {
  const f = await setupStatement(401);
  f.state.rows[0].date = [2026, 11, 3];
  f.state.rows[400].date = [2026, 11, 5];
  const range = { ...f.query, from: "2026-11-03", to: "2026-11-05" };
  expect((await f.read({ ...range, page: 1 })).rows).toHaveLength(200);
  const next = new URL(f.calls.at(-1) ?? "", "https://native.test/");
  expect(next.searchParams.get("offset")).toBe("1");
  expect(next.searchParams.get("fromDate")).toBe(range.from);
  expect(next.searchParams.get("toDate")).toBe(range.to);
  const all = await f.read({ ...range, mode: "export" });
  expect(all.rows).toHaveLength(401);
  expect(all.total).toBe(401);
  expect(all.rows[400].date).toEqual([2026, 11, 5]);
});
test("empty matching source is explicit and missing running/reversal fields never become zero or false", async () => {
  const f = await setupStatement();
  const empty = await f.read({
    ...f.query,
    from: "2001-01-01",
    to: "2001-01-01",
  });
  expect(empty.total).toBe(0);
  expect(empty.rows).toEqual([]);
  f.state.changePage = (_, body) => ({
    ...body,
    content: body.content.map((r) => ({
      ...r,
      runningBalance: undefined,
      reversed: null,
      entryType: null,
    })),
  });
  const unknown = await f.read();
  expect(unknown.rows[0].runningBalance).toBeUndefined();
  expect(unknown.rows[0].reversed).toBeNull();
  expect(unknown.rows[0].entryType).toBeNull();
  f.state.changePage = (_, body) => ({
    ...body,
    content: body.content.map((r) => ({ ...r, runningBalance: -25.5 })),
  });
  expect((await f.read()).rows[0].runningBalance).toBe(-25.5);
});
test("customer role and registered foreign branch are rejected before Core reads", async () => {
  const f = await setupStatement();
  await expect(f.read(f.query, f.source)).rejects.toThrow("staff");
  f.h.db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('foreign-statement-bank','ready',999001,999002)",
  );
  f.h.db.run(
    "INSERT INTO customers(id,branch_id,bank_id,reference,display_name,client_id,account_id,account_no,origin,status) VALUES(?,?,?,?,?,?,?,?,?,?)",
    [
      "foreign-statement-customer",
      "foreign-statement-bank",
      "foreign-statement-bank",
      "foreign-statement-ref",
      "Synthetic foreign customer",
      999001,
      999002,
      "999002",
      "seed",
      "active",
    ],
  );
  await expect(
    f.read(f.query, f.officer, "foreign-statement-customer"),
  ).rejects.toThrow("outside this branch");
  expect(f.calls).toEqual([]);
});
test("forged native account identity and currency withhold the transaction request", async () => {
  const f = await setupStatement();
  for (const account of [
    { ...f.account, id: f.account.id + 1 },
    { ...f.account, clientId: f.account.clientId + 1 },
    { ...f.account, accountNo: "foreign" },
    { ...f.account, currency: { code: "USD", decimalPlaces: 2 } },
  ]) {
    f.state.account = account;
    await expect(f.read()).rejects.toThrow();
  }
  expect(f.calls.every((path) => !path.includes("transactions/search"))).toBe(
    true,
  );
});
test("invalid ranges, impossible dates and out-of-order export pages are rejected before native access", async () => {
  const f = await setupStatement();
  for (const input of [
    { ...f.query, from: "2026-02-29" },
    { ...f.query, from: "2026-11-05", to: "2026-11-04" },
    { ...f.query, page: -1 },
    { ...f.query, page: 1, mode: "export" as const },
  ])
    await expect(f.read(input)).rejects.toThrow("valid inclusive");
  expect(f.calls).toEqual([]);
});
test("malformed native rows and page metadata cannot masquerade as complete financial evidence", async () => {
  const f = await setupStatement(2);
  const faults = [
    (b: unknown) => ({ ...(b as object), total: 3 }),
    (b: unknown) => ({ ...(b as object), content: null }),
    (b: unknown) => ({
      ...(b as object),
      pageable: {
        pageNumber: 200,
        pageSize: 200,
        sort: { orders: [{ property: "id", direction: "DESC" }] },
      },
    }),
    (b: unknown) => ({
      ...(b as object),
      pageable: {
        pageNumber: 0,
        pageSize: 200,
        sort: { orders: [{ property: "id", direction: "ASC" }] },
      },
    }),
    ...[
      { accountId: 999999 },
      { accountNo: "foreign" },
      { currency: { code: "INR", decimalPlaces: 0 } },
      { amount: 1.001 },
      { amount: -1 },
      { runningBalance: Infinity },
      { runningBalance: 2.345 },
      { date: [2026, 2, 29] },
      { id: 0 },
      { entryType: "other" },
    ].map((patch) => (b: unknown) => ({
      ...(b as object),
      content: f.state.rows.map((r, i) => (i === 0 ? { ...r, ...patch } : r)),
    })),
    (b: unknown) => ({
      ...(b as object),
      content: [f.state.rows[0], f.state.rows[0]],
    }),
  ];
  for (const fault of faults) {
    f.state.changePage = (_, body) => fault(body);
    await expect(f.read()).rejects.toThrow();
  }
});
test("native date-filter violations and cross-page duplicates or changed totals withhold the whole export", async () => {
  const f = await setupStatement(201);
  f.state.changePage = (_, b) => ({
    ...b,
    content: b.content.map((r) => ({ ...r, date: [2026, 11, 2] })),
  });
  await expect(f.read({ ...f.query, from: "2026-11-04" })).rejects.toThrow(
    "dates",
  );
  f.state.changePage = (page, b) =>
    page ? { ...b, content: [f.state.rows[199]] } : b;
  await expect(f.read({ ...f.query, mode: "export" })).rejects.toThrow(
    "invalid",
  );
  f.state.changePage = (page, b) => ({
    ...b,
    total: page ? 202 : 201,
    content: page
      ? [f.state.rows[200], { ...f.state.rows[200], id: 1 }]
      : b.content,
  });
  await expect(f.read({ ...f.query, mode: "export" })).rejects.toThrow(
    "totals changed",
  );
});
test("export limit rejects partial files while page enquiry remains available", async () => {
  const f = await setupStatement(5001);
  expect((await f.read()).rows).toHaveLength(200);
  expect(
    await f.run(
      readSavingsStatement(f.officer, f.recipientId, {
        ...f.query,
        mode: "export",
      }).pipe(Effect.flip),
    ),
  ).toMatchObject({ status: 413 });
});
test("route validates selectors and marks financial responses no-store", async () => {
  const f = await setupStatement();
  const response = await f.run(
    branchRoutes(
      new Request(
        `https://example.test/api/branch/savings-statement?customerId=${f.recipientId}`,
      ),
      f.officer,
    ),
  );
  expect(response?.status).toBe(200);
  expect(response?.headers.get("Cache-Control")).toBe("no-store");
  for (const query of [
    "page=",
    "page=1e0",
    "page=0&page=1",
    "accountId=9999",
    "mode=partial",
  ]) {
    expect(
      await f.run(
        branchRoutes(
          new Request(
            `https://example.test/api/branch/savings-statement?customerId=${f.recipientId}&${query}`,
          ),
          f.officer,
        ).pipe(Effect.flip),
      ),
    ).toMatchObject({ status: 400 });
  }
});
