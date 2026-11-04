import { Effect, Layer } from "effect";
import {
  BankingError,
  type Session,
} from "../../../src/platform/banking-workspace/domain/banking";
import { Core } from "../../../src/platform/banking-workspace/domain/ports";
import { readSavingsStatement } from "../../../src/platform/branch-operations/application/savings-statement";
import type { StatementQuery } from "../../../src/platform/branch-operations/domain/savings-statement";
import { createHarness } from "../../customers/customer-banking.harness";

const harness = createHarness();
export const setupStatement = async (total = 1) => {
  const { h, source, recipientId } = await harness.twoCustomers();
  const registered = h.db
    .query("SELECT account_id,account_no,client_id FROM customers WHERE id=?")
    .get(recipientId) as {
    account_id: number;
    account_no: string;
    client_id: number;
  };
  const currency = { code: "INR", decimalPlaces: 2 } as const;
  const account = {
    id: registered.account_id,
    accountNo: registered.account_no,
    clientId: registered.client_id,
    currency,
    clientOfficeId: 1,
    savingsProductId: 1,
    savingsProductName: "Native synthetic savings",
  };
  const rows = Array.from({ length: total }, (_, i) => ({
    id: 500000 - i,
    accountId: account.id,
    accountNo: account.accountNo,
    currency,
    date: [2026, 11, 4],
    transactionType: { id: 1, value: "Deposit" },
    entryType: "CREDIT",
    amount: 1.25,
    runningBalance: 0,
    reversed: false,
    submittedByUsername: "private-native-user",
    paymentDetailData: { private: "never project" },
  }));
  const pageBody = (content: typeof rows, page: number) => ({
    total: content.length,
    content: content.slice(page * 200, (page + 1) * 200),
    pageable: {
      pageNumber: page,
      pageSize: 200,
      sort: { orders: [{ property: "id", direction: "DESC" }] },
    },
  });
  const state: {
    account: unknown;
    rows: typeof rows;
    changePage:
      | null
      | ((page: number, body: ReturnType<typeof pageBody>) => unknown);
  } = { account, rows, changePage: null };
  const calls: string[] = [];
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string) =>
      Effect.try({
        try: () => {
          if (method !== "GET")
            throw new Error("Statement attempted a Core write");
          calls.push(path);
          const url = new URL(path, "https://native.test/");
          if (url.pathname === `/savingsaccounts/${account.id}`)
            return state.account as T;
          if (
            url.pathname !==
            `/savingsaccounts/${account.id}/transactions/search`
          )
            throw new Error("Unexpected native route");
          const page = Number(url.searchParams.get("offset")),
            from = url.searchParams.get("fromDate"),
            to = url.searchParams.get("toDate");
          const filtered = state.rows.filter((row) => {
            const date = row.date
              .map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0"))
              .join("-");
            return (!from || date >= from) && (!to || date <= to);
          });
          const body = pageBody(filtered, page);
          return (state.changePage ? state.changePage(page, body) : body) as T;
        },
        catch: () =>
          new BankingError({
            message: "Native fixture unavailable",
            status: 503,
          }),
      }),
  });
  const officer = { ...source, role: "officer" as const };
  const query: StatementQuery = { from: null, to: null, page: 0, mode: "page" };
  const run = <
    A,
    E,
    R extends Effect.Effect.Context<ReturnType<typeof readSavingsStatement>>,
  >(
    effect: Effect.Effect<A, E, R>,
  ) => harness.run(h, effect.pipe(Effect.provide(core)));
  const read = (
    input: StatementQuery = query,
    session: Session = officer,
    customerId = recipientId,
  ) => run(readSavingsStatement(session, customerId, input));
  return {
    h,
    source,
    officer,
    recipientId,
    registered,
    account,
    state,
    calls,
    query,
    read,
    run,
  };
};
