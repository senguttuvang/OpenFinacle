import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import {
  SavingsStatement,
  StatementAccount,
  StatementNativePage,
  StatementQuery,
  statementPageMatches,
} from "../domain/savings-statement";
import { branchCustomer } from "./branch-day";

const fail = (message: string, status = 503) =>
  Effect.fail(new BankingError({ message, status }));
const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Native savings statement evidence is unavailable or invalid. No export was produced.",
          status: 503,
        }),
    ),
  );
const queryPath = (accountId: number, query: StatementQuery) => {
  const parameters = new URLSearchParams({
    offset: String(query.page),
    limit: "200",
    orderBy: "id",
    sortOrder: "DESC",
    dateFormat: "yyyy-MM-dd",
    locale: "en",
  });
  if (query.from) parameters.set("fromDate", query.from);
  if (query.to) parameters.set("toDate", query.to);
  return `savingsaccounts/${accountId}/transactions/search?${parameters}`;
};
export const readSavingsStatement = (
  session: Session,
  customerId: string,
  input: StatementQuery,
) =>
  Effect.gen(function* () {
    const { branch, customer } = yield* branchCustomer(session, customerId);
    const query = yield* Schema.decodeUnknown(StatementQuery, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "Use valid inclusive native dates, a nonnegative page number and a complete-range export from page zero.",
            status: 400,
          }),
      ),
    );
    if (
      ![customer.account_id, customer.client_id].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      !customer.account_no
    )
      return yield* fail("Registered native savings identity is unavailable.");
    const startedAt = yield* Clock.currentTimeMillis,
      core = yield* Core;
    const account = yield* parse(
      StatementAccount,
      yield* core.request<unknown>(
        "GET",
        `savingsaccounts/${customer.account_id}?fields=id,accountNo,clientId,currency,savingsProductId,savingsProductName,clientOfficeId,clientOfficeName`,
      ),
    );
    if (
      account.id !== customer.account_id ||
      account.clientId !== customer.client_id ||
      account.accountNo !== customer.account_no
    )
      return yield* fail(
        "Native account identity does not match this registered branch customer.",
      );
    const page = (pageQuery: StatementQuery) =>
      Effect.gen(function* () {
        const value = yield* parse(
          StatementNativePage,
          yield* core.request<unknown>("GET", queryPath(account.id, pageQuery)),
        );
        if (!statementPageMatches(value, account, pageQuery))
          return yield* fail(
            "Native statement ownership, dates, sort or page coverage could not be verified.",
          );
        return value;
      });
    const first = yield* page(query);
    if (query.mode === "export" && first.total > 5000)
      return yield* fail(
        "More than 5000 native transactions match. Narrow the native date range before exporting; no partial export was produced.",
        413,
      );
    const pages =
      query.mode === "export"
        ? yield* Effect.forEach(
            Array.from(
              { length: Math.max(0, Math.ceil(first.total / 200) - 1) },
              (_, i) => i + 1,
            ),
            (i) => page({ ...query, page: i, mode: "page" }),
            { concurrency: 4 },
          )
        : [];
    if (pages.some((p) => p.total !== first.total))
      return yield* fail(
        "Native matching totals changed during the read. Refresh before exporting; no partial export was produced.",
      );
    const rows = [...first.content, ...pages.flatMap((p) => p.content)];
    return yield* parse(SavingsStatement, {
      source: "Fineract savings transaction search",
      branchId: branch,
      customerId: customer.id,
      customerReference: customer.reference,
      account,
      query,
      applicationDate: bankingDate(startedAt),
      startedAt,
      observedAt: yield* Clock.currentTimeMillis,
      pageSize: 200,
      total: first.total,
      rows,
    });
  });
