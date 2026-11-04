import { Schema } from "effect";
import { bankingDate } from "../../banking-workspace/domain/banking";
import { coreDate } from "./branch-day";
import { CoreDateEvidence } from "./core-account";

const id = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.filter(Number.isSafeInteger),
);
const count = Schema.Number.pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.filter(Number.isSafeInteger),
);
const time = Schema.Number.pipe(
  Schema.int(),
  Schema.between(0, 8640000000000000),
);
const text = Schema.NonEmptyString.pipe(Schema.maxLength(200));
const currency = Schema.Struct({
  code: Schema.Literal("INR"),
  decimalPlaces: Schema.Literal(2),
});
const signedMoney = Schema.Number.pipe(
  Schema.finite(),
  Schema.filter(
    (n) =>
      Number.isSafeInteger(Math.round(n * 100)) &&
      n === Math.round(n * 100) / 100,
  ),
);
const StatementDate = Schema.String.pipe(
  Schema.filter(
    (s) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) && coreDate(s.split("-").map(Number)) === s,
  ),
);
export const StatementQuery = Schema.Struct({
  from: Schema.NullOr(StatementDate),
  to: Schema.NullOr(StatementDate),
  page: count.pipe(Schema.lessThanOrEqualTo(1000000)),
  mode: Schema.Literal("page", "export"),
}).pipe(
  Schema.filter(
    (q) =>
      (!q.from || !q.to || q.from <= q.to) &&
      (q.mode !== "export" || q.page === 0),
  ),
);
export type StatementQuery = typeof StatementQuery.Type;
export const StatementAccount = Schema.Struct({
  id,
  clientId: id,
  accountNo: text,
  currency,
  clientOfficeId: Schema.optional(Schema.NullOr(id)),
  clientOfficeName: Schema.optional(Schema.NullOr(text)),
  savingsProductId: Schema.optional(Schema.NullOr(id)),
  savingsProductName: Schema.optional(Schema.NullOr(text)),
});
const Transaction = Schema.Struct({
  id,
  accountId: id,
  accountNo: text,
  currency,
  date: CoreDateEvidence,
  transactionType: Schema.Struct({ id, value: text }),
  entryType: Schema.optional(Schema.NullOr(Schema.Literal("CREDIT", "DEBIT"))),
  amount: signedMoney.pipe(Schema.nonNegative()),
  runningBalance: Schema.optional(Schema.NullOr(signedMoney)),
  reversed: Schema.optional(Schema.NullOr(Schema.Boolean)),
});
export const StatementNativePage = Schema.Struct({
  total: count,
  content: Schema.Array(Transaction).pipe(Schema.maxItems(200)),
  pageable: Schema.Struct({
    pageNumber: count,
    pageSize: Schema.Literal(200),
    sort: Schema.Struct({
      orders: Schema.Array(
        Schema.Struct({
          property: Schema.Literal("id"),
          direction: Schema.Literal("DESC"),
        }),
      ).pipe(Schema.itemsCount(1)),
    }),
  }),
});
const statementRowsMatch = (
  rows: readonly (typeof Transaction.Type)[],
  account: typeof StatementAccount.Type,
  query: StatementQuery,
) =>
  rows.every(
    (r, i) =>
      r.accountId === account.id &&
      r.accountNo === account.accountNo &&
      (!query.from || coreDate(r.date) >= query.from) &&
      (!query.to || coreDate(r.date) <= query.to) &&
      (i === 0 || rows[i - 1].id > r.id),
  );
export const statementPageMatches = (
  page: typeof StatementNativePage.Type,
  account: typeof StatementAccount.Type,
  query: StatementQuery,
) =>
  page.pageable.pageNumber === query.page &&
  page.content.length ===
    Math.min(200, Math.max(0, page.total - query.page * 200)) &&
  statementRowsMatch(page.content, account, query);
export const SavingsStatement = Schema.Struct({
  source: Schema.Literal("Fineract savings transaction search"),
  branchId: text,
  customerId: text,
  customerReference: text,
  account: StatementAccount,
  query: StatementQuery,
  applicationDate: StatementDate,
  startedAt: time,
  observedAt: time,
  pageSize: Schema.Literal(200),
  total: count,
  rows: Schema.Array(Transaction).pipe(Schema.maxItems(5000)),
}).pipe(
  Schema.filter(
    (v) =>
      v.startedAt <= v.observedAt &&
      v.applicationDate === bankingDate(v.startedAt) &&
      statementRowsMatch(v.rows, v.account, v.query) &&
      (v.query.mode === "export"
        ? v.total <= 5000 && v.rows.length === v.total
        : v.rows.length ===
          Math.min(200, Math.max(0, v.total - v.query.page * 200))),
  ),
);
export type SavingsStatement = typeof SavingsStatement.Type;
