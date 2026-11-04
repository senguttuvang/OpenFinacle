import { expect, test } from "bun:test";
import { statementCsv } from "../../../src/platform/branch-operations/domain/statement-csv";
import { setupStatement } from "./statement.harness";

test("CSV retains source, scope, dates and zero-result provenance without inventing a transaction", async () => {
  const f = await setupStatement();
  const empty = await f.read({
    ...f.query,
    mode: "export",
    from: "2001-01-01",
    to: "2001-01-01",
  });
  const csv = statementCsv(empty);
  expect(csv).not.toBeNull();
  expect(csv?.split("\r\n")).toHaveLength(2);
  expect(csv).toContain('"Record kind","Source","Servicing branch"');
  expect(csv).toContain(
    '"enquiry","Fineract savings transaction search","branch"',
  );
  expect(csv).toContain('"2001-01-01","2001-01-01"');
  expect(csv).toContain(new Date(empty.startedAt).toISOString());
  expect(csv).toContain(new Date(empty.observedAt).toISOString());
  expect(csv).not.toContain('"transaction",');
});
test("CSV preserves numeric zero and negative native balances and guards dangerous text without changing numeric cells", async () => {
  const f = await setupStatement(3);
  f.state.changePage = (_, body) => ({
    ...body,
    content: body.content.map((r, i) => ({
      ...r,
      runningBalance: i === 0 ? 0 : i === 1 ? -25.5 : undefined,
      reversed: i === 2 ? null : false,
      transactionType: {
        id: 1,
        value:
          i === 0
            ? '=HYPERLINK("https://example.invalid","Click")'
            : i === 1
              ? 'Type, "quoted"\nnext line'
              : "  @SUM(1,1)",
      },
    })),
  });
  const value = await f.read({ ...f.query, mode: "export" });
  const exported = {
    ...value,
    customerReference: " \u0000=SUM(1,1)",
    account: { ...value.account, accountNo: "000000156" },
    rows: value.rows.map((r) => ({ ...r, accountNo: "000000156" })),
  };
  const csv = statementCsv(exported);
  expect(csv).not.toBeNull();
  expect(csv).toContain('"\' \u0000=SUM(1,1)"');
  expect(csv).toContain(
    '"\'=HYPERLINK(""https://example.invalid"",""Click"")"',
  );
  expect(csv).toContain('"Type, ""quoted""\nnext line"');
  expect(csv).toContain('"\'  @SUM(1,1)"');
  expect(csv).toContain('"000000156"');
  expect(csv).toContain('"CREDIT","1.25","0","false"');
  expect(csv).toContain('"CREDIT","1.25","-25.5","false"');
  expect(csv).toContain('"CREDIT","1.25","",""');
});
test("partial pages, forged totals and malformed financial values cannot produce CSV", async () => {
  const f = await setupStatement();
  const page = await f.read();
  expect(statementCsv(page)).toBeNull();
  const value = await f.read({ ...f.query, mode: "export" });
  expect(statementCsv({ ...value, total: 2 })).toBeNull();
  expect(
    statementCsv({
      ...value,
      rows: value.rows.map((r) => ({ ...r, runningBalance: NaN })),
    }),
  ).toBeNull();
  expect(
    statementCsv({
      ...value,
      rows: value.rows.map((r) => ({ ...r, accountNo: "foreign" })),
    }),
  ).toBeNull();
});
test("the full5000-row boundary is exported without dropping the last native page", async () => {
  const f = await setupStatement(5000),
    value = await f.read({ ...f.query, mode: "export" });
  expect(value.rows).toHaveLength(5000);
  expect(value.rows.at(-1)?.id).toBe(495001);
  expect(
    f.calls.filter((path) => path.includes("transactions/search")),
  ).toHaveLength(25);
  expect(
    new Set(
      f.calls
        .filter((path) => path.includes("transactions/search"))
        .map((path) =>
          new URL(path, "https://native.test").searchParams.get("offset"),
        ),
    ).size,
  ).toBe(25);
  expect(statementCsv(value)?.split("\r\n")).toHaveLength(5002);
});
