import { Database } from "bun:sqlite";
import { Effect, Layer } from "effect";
import { customerProvisionerLayer } from "../../src/adapters/customer-provisioning";
import { customerTransferLayer } from "../../src/adapters/customer-transfers";
import { BankingError } from "../../src/domain/banking";
import { Core, Store } from "../../src/domain/ports";

interface Client {
  id: number;
  externalId: string;
  firstname: string;
  lastname: string;
  officeId: number;
  active: boolean;
}
interface Transaction {
  id: number;
  accountId: number;
  currency: { code: string; decimalPlaces: number };
  date: number[];
  amount: number;
  reversed: boolean;
  transactionType: { id: number; value: string };
  paymentDetailData?: { receiptNumber: string; paymentType: { id: number } };
  transfer?: {
    id: number;
    reversed: boolean;
    transferDescription: string;
    transferAmount: number;
    transferDate: number[] | string;
  };
}
export interface Savings {
  id: number;
  clientId: number;
  clientName: string;
  savingsProductId: number;
  externalId: string;
  accountNo: string;
  currency: { code: string; decimalPlaces: number };
  status: { id: number; active: boolean };
  allowOverdraft: boolean;
  withdrawalFeeForTransfers: boolean;
  subStatus?: { block?: boolean; blockDebit?: boolean; blockCredit?: boolean };
  summary: { availableBalance: number; accountBalance: number };
  transactions: Transaction[];
}
const currency = { code: "INR", decimalPlaces: 2 };
const createAccount = (
  id: number,
  clientId: number,
  name: string,
  amount: number,
  externalId: string,
): Savings => ({
  id,
  clientId,
  clientName: name,
  externalId,
  accountNo: `SYN${String(id).padStart(8, "0")}`,
  savingsProductId: 1,
  currency,
  status: { id: 300, active: true },
  allowOverdraft: false,
  withdrawalFeeForTransfers: false,
  summary: { accountBalance: amount, availableBalance: amount },
  transactions: [],
});
const paths: string[] = [];
for await (const path of new Bun.Glob("migrations/*.sql").scan("."))
  paths.push(path);
const migrations = (
  await Promise.all(paths.sort().map((path) => Bun.file(path).text()))
).join("\n");
export const customerHarness = (filename = ":memory:") => {
  let db = new Database(filename);
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(migrations);
  db.run(
    "INSERT INTO banks(id,journey,status,customer_client,customer_account,recipient_client,recipient_account,employer_client,employer_account) VALUES('branch','existing','ready',1,11,2,12,3,13),('other','existing','ready',4,14,2,12,3,13)",
  );
  db.run(
    "INSERT INTO settings(key,value) VALUES('savings_product','1'),('cash_payment_type','1'),('demo_existing_bank','branch')",
  );
  const clients = new Map<number, Client>(
    [1, 2, 3, 4].map((id) => [
      id,
      {
        id,
        externalId: `original-${id}`,
        firstname: ["Mira", "Arjun", "Northstar", "Priya"][id - 1],
        lastname: "Synthetic",
        officeId: 1,
        active: true,
      },
    ]),
  );
  const accounts = new Map<number, Savings>(
    [11, 12, 13, 14].map((id) => [
      id,
      createAccount(
        id,
        id - 10,
        `${clients.get(id - 10)?.firstname} Synthetic`,
        100000,
        `original-${id}`,
      ),
    ]),
  );
  const transfers = new Map<number, unknown>();
  db.run(
    "INSERT INTO financial_snapshots(bank_id,payload,synced_at) VALUES('branch',?,?)",
    [
      JSON.stringify({
        account: accounts.get(11),
        recipient: accounts.get(12),
        employer: accounts.get(13),
      }),
      Date.now(),
    ],
  );
  const calls: { method: string; path: string; key?: string }[] = [];
  let nextClient = 100,
    nextAccount = 200,
    nextTransaction = 1000,
    nextTransfer = 10000;
  let failAfter: string | null = null;
  let hideCredit = false;
  let rejectWrite = false;
  let isoTransferDates = false;
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.try({
        try: () => {
          calls.push({ method, path, key });
          const input = body as Record<string, string | number>;
          const parts = path.split("?")[0].split("/");
          let result: unknown;
          if (method === "GET" && parts[0] === "clients") {
            result =
              parts[1] === "external-id"
                ? [...clients.values()].find(
                    (row) => row.externalId === decodeURIComponent(parts[2]),
                  )
                : clients.get(Number(parts[1]));
          } else if (method === "GET" && parts[0] === "savingsaccounts") {
            if (parts[2] === "transactions" && parts[3]) {
              const transaction = accounts
                .get(Number(parts[1]))
                ?.transactions.find((row) => row.id === Number(parts[3]));
              if (!transaction)
                throw new BankingError({
                  message: "Owned transaction not found",
                  status: 404,
                });
              const { transactionType: _type, ...detail } =
                structuredClone(transaction);
              return detail as T;
            }
            const saved =
              parts[1] === "external-id"
                ? [...accounts.values()].find(
                    (row) => row.externalId === decodeURIComponent(parts[2]),
                  )
                : accounts.get(Number(parts[1]));
            result = saved ? structuredClone(saved) : undefined;
            if (result)
              for (const transaction of (result as Savings).transactions)
                delete transaction.paymentDetailData;
            if (isoTransferDates && result)
              for (const transaction of (result as Savings).transactions) {
                if (
                  transaction.transfer &&
                  Array.isArray(transaction.transfer.transferDate)
                )
                  transaction.transfer.transferDate =
                    transaction.transfer.transferDate
                      .map((part, index) =>
                        String(part).padStart(index === 0 ? 4 : 2, "0"),
                      )
                      .join("-");
              }
            if (hideCredit && result)
              (result as Savings).transactions = (
                result as Savings
              ).transactions.filter(
                (row) => row.transactionType.id !== 1 || !row.transfer,
              );
          } else if (method === "GET" && parts[0] === "accounttransfers")
            result = transfers.get(Number(parts[1]));
          else if (method === "POST") {
            if (rejectWrite)
              throw new BankingError({
                message: "Core declined",
                status: 422,
                uncertain: false,
              });
            if (path === "clients") {
              if (
                [...clients.values()].some(
                  (row) => row.externalId === input.externalId,
                )
              )
                throw new Error("Duplicate synthetic external identity");
              const id = nextClient++;
              clients.set(id, {
                id,
                externalId: String(input.externalId),
                firstname: String(input.firstname),
                lastname: String(input.lastname),
                officeId: 1,
                active: true,
              });
              result = { resourceId: id };
            } else if (path === "savingsaccounts") {
              const id = nextAccount++;
              const owner = clients.get(Number(input.clientId));
              if (!owner) throw new Error("Missing owner");
              const account = createAccount(
                id,
                owner.id,
                `${owner.firstname} ${owner.lastname}`,
                0,
                String(input.externalId),
              );
              account.status = { id: 100, active: false };
              accounts.set(id, account);
              result = { resourceId: id };
            } else if (path === "accounttransfers") {
              const source = accounts.get(Number(input.fromAccountId)),
                target = accounts.get(Number(input.toAccountId));
              const amount = Number(input.transferAmount);
              if (
                !source ||
                !target ||
                source.clientId !== Number(input.fromClientId) ||
                target.clientId !== Number(input.toClientId) ||
                source.summary.availableBalance < amount
              )
                throw new BankingError({
                  message: "Insufficient owned funds",
                  status: 422,
                  uncertain: false,
                });
              const id = nextTransfer++;
              const date = String(input.transferDate).split("-").map(Number);
              const transfer = {
                id,
                currency,
                reversed: false,
                transferDescription: String(input.transferDescription),
                transferAmount: amount,
                transferDate: date,
              };
              source.summary.accountBalance -= amount;
              source.summary.availableBalance -= amount;
              target.summary.accountBalance += amount;
              target.summary.availableBalance += amount;
              source.transactions.push({
                id: nextTransaction++,
                accountId: source.id,
                currency,
                date,
                amount,
                reversed: false,
                transactionType: { id: 2, value: "Withdrawal" },
                transfer,
              });
              target.transactions.push({
                id: nextTransaction++,
                accountId: target.id,
                currency,
                date,
                amount,
                reversed: false,
                transactionType: { id: 1, value: "Deposit" },
                transfer,
              });
              transfers.set(id, {
                ...transfer,
                transferDate: String(input.transferDate),
                fromOffice: { id: 1 },
                toOffice: { id: 1 },
                fromClient: { id: source.clientId },
                toClient: { id: target.clientId },
                fromAccount: { id: source.id },
                toAccount: { id: target.id },
                fromAccountType: { id: 2 },
                toAccountType: { id: 2 },
              });
              result = { resourceId: id };
            } else {
              const account = accounts.get(Number(parts[1]));
              if (!account) throw new Error("Missing account");
              if (path.endsWith("command=approve"))
                account.status = { id: 200, active: false };
              else if (path.endsWith("command=activate"))
                account.status = { id: 300, active: true };
              else if (
                path.endsWith("command=deposit") ||
                path.endsWith("command=withdrawal")
              ) {
                const amount = Number(input.transactionAmount);
                const direction = path.endsWith("command=deposit") ? 1 : -1;
                if (
                  direction === -1 &&
                  account.summary.availableBalance < amount
                )
                  throw new BankingError({
                    message: "Insufficient funds",
                    status: 422,
                    uncertain: false,
                  });
                account.summary.accountBalance += direction * amount;
                account.summary.availableBalance += direction * amount;
                const id = nextTransaction++;
                account.transactions.push({
                  id,
                  accountId: account.id,
                  currency,
                  date: String(input.transactionDate).split("-").map(Number),
                  amount,
                  reversed: false,
                  transactionType: {
                    id: direction === 1 ? 1 : 2,
                    value: direction === 1 ? "Deposit" : "Withdrawal",
                  },
                  paymentDetailData: {
                    receiptNumber: String(input.receiptNumber),
                    paymentType: { id: Number(input.paymentTypeId) },
                  },
                });
                result = { resourceId: id };
              } else throw new Error(`Unimplemented fixture write ${path}`);
              result ??= { resourceId: account.id };
            }
            if (failAfter === path) {
              failAfter = null;
              throw new BankingError({
                message: "Response lost after commit",
                status: 503,
                uncertain: true,
              });
            }
          }
          if (result === undefined)
            throw new BankingError({
              message: "Core record not found",
              status: 404,
            });
          return structuredClone(result) as T;
        },
        catch: (error) =>
          error instanceof BankingError
            ? error
            : new BankingError({
                message: String(error),
                status: 503,
                uncertain: method !== "GET",
              }),
      }),
  });
  const store = Layer.succeed(Store, {
    all: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).all(...values) as T[],
        catch: (error) =>
          new BankingError({ message: String(error), status: 503 }),
      }),
    one: <T>(sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.query(sql).get(...values) as T | null,
        catch: (error) =>
          new BankingError({ message: String(error), status: 503 }),
      }),
    run: (sql: string, ...values: (string | number | null)[]) =>
      Effect.try({
        try: () => db.run(sql, values).changes,
        catch: (error) =>
          new BankingError({ message: String(error), status: 503 }),
      }),
  });
  const base = Layer.merge(core, store);
  const layer = Layer.merge(
    base,
    Layer.merge(customerTransferLayer, customerProvisionerLayer).pipe(
      Layer.provide(base),
    ),
  );
  return {
    get db() {
      return db;
    },
    reopen: () => {
      if (filename === ":memory:")
        throw new Error("Reopen requires a disk-backed disposable fixture");
      db.close();
      db = new Database(filename);
      db.exec("PRAGMA foreign_keys=ON");
    },
    accounts,
    clients,
    calls,
    transfers,
    layer,
    loseResponse: (path: string) => {
      failAfter = path;
    },
    hideRecipientCredit: (hide: boolean) => {
      hideCredit = hide;
    },
    rejectWrites: () => {
      rejectWrite = true;
    },
    useISOTransferDates: () => {
      isoTransferDates = true;
    },
  };
};
