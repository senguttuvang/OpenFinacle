import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import {
  bootstrap,
  createCommand,
  executeCommand,
  rejectCommand,
  startBank,
  submitApplication,
} from "../src/application/banking";
import {
  BankingError,
  bankingDate,
  canApprove,
  moneyToMinor,
  type Session,
} from "../src/domain/banking";
import {
  Core,
  type CoreService,
  Store,
  type StoreService,
} from "../src/domain/ports";

const customer: Session = {
  token_hash: "customer",
  bank_id: "bank-one",
  role: "customer",
  expires_at: Number.MAX_SAFE_INTEGER,
};
const officer: Session = { ...customer, role: "officer" };
const approver: Session = { ...customer, role: "approver" };
let db: Database;
let postings: { path: string; body: unknown; key?: string }[];
let coreFailure: BankingError | undefined;
let lastBalance = 10000;
beforeEach(async () => {
  db?.close();
  db = new Database(":memory:");
  db.exec(await Bun.file("migrations/0001_workflows.sql").text());
  db.exec(await Bun.file("migrations/0002_reversal_guard.sql").text());
  db.run("INSERT INTO settings(key,value) VALUES('cash_payment_type','1')");
  db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account,recipient_client,recipient_account,employer_client,employer_account) VALUES('bank-one','ready',1,101,2,102,3,103)",
  );
  db.run(
    "INSERT INTO banks(id,status,customer_client,customer_account) VALUES('other-bank','ready',4,104)",
  );
  db.run(
    "INSERT INTO beneficiaries(id,bank_id,name,account_id,account_no,status) VALUES('arjun','bank-one','Arjun',102,'000102','active')",
  );
  postings = [];
  coreFailure = undefined;
  lastBalance = 10000;
});
const layers = () =>
  Layer.merge(
    Layer.succeed(Store, {
      all: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).all(...values) as T[]),
      one: <T>(sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.query(sql).get(...values) as T | null),
      run: (sql: string, ...values: (string | number | null)[]) =>
        Effect.sync(() => db.run(sql, values).changes),
    }),
    Layer.succeed(Core, {
      request: <T>(
        method: string,
        path: string,
        body?: unknown,
        key?: string,
      ) =>
        Effect.gen(function* () {
          if (coreFailure) return yield* Effect.fail(coreFailure);
          if (
            method === "GET" &&
            [
              "glaccounts",
              "savingsproducts",
              "paymenttypes",
              "financialactivityaccounts",
            ].includes(path)
          )
            return [] as T;
          if (method !== "GET") {
            postings.push({ path, body, key });
            const transfer = body as {
              transferAmount?: string;
              transactionAmount?: number;
            };
            const amount = Number(
              transfer.transferAmount ?? transfer.transactionAmount ?? 0,
            );
            if (amount > lastBalance && path === "accounttransfers")
              return yield* Effect.fail(
                new BankingError({
                  message: "Insufficient funds",
                  status: 422,
                }),
              );
            if (path === "accounttransfers") lastBalance -= amount;
          }
          return { resourceId: 900 + postings.length } as T;
        }),
    }),
  );
const run = <A>(
  task: Effect.Effect<A, BankingError, CoreService | StoreService>,
) => Effect.runPromise(task.pipe(Effect.provide(layers())));
const failureOf = <A>(
  task: Effect.Effect<A, BankingError, CoreService | StoreService>,
) => Effect.runPromise(task.pipe(Effect.provide(layers()), Effect.flip));

test("savings-product setup uses the product API contract without an unsupported date format", async () => {
  await run(bootstrap);
  const product = postings.find(
    (posting) => posting.path === "savingsproducts",
  );
  expect(product?.body).toMatchObject({
    currencyCode: "INR",
    accountingRule: 2,
    locale: "en",
  });
  expect(product?.body).not.toHaveProperty("dateFormat");
});

test("workspace setup identifies people and the employer using the core legal forms", async () => {
  await run(bootstrap);
  await run(startBank);
  const clients = postings.filter((posting) => posting.path === "clients");
  expect(clients[0].body).toMatchObject({
    legalFormId: 1,
    firstname: "Arjun",
    lastname: "Raman",
  });
  expect(clients[1].body).toMatchObject({
    legalFormId: 2,
    fullname: "Northstar Studio",
  });
  expect(
    postings
      .filter((posting) =>
        posting.path.endsWith("transactions?command=deposit"),
      )
      .every(
        (posting) =>
          (posting.body as { paymentTypeId?: number }).paymentTypeId === 1,
      ),
  ).toBe(true);
});

test("bootstrap configures a real cash payment channel when it is missing", async () => {
  db.run("DELETE FROM settings WHERE key='cash_payment_type'");
  await run(bootstrap);
  expect(
    postings.find((posting) => posting.path === "paymenttypes")?.body,
  ).toMatchObject({ isCashPayment: true });
  expect(
    db.query("SELECT value FROM settings WHERE key='cash_payment_type'").get(),
  ).toBeTruthy();
});

test("bootstrap repairs the required savings transfer mapping even when its product already exists", async () => {
  db.run("INSERT INTO settings(key,value) VALUES('savings_product','1')");
  await run(bootstrap);
  expect(
    postings.find((posting) => posting.path === "financialactivityaccounts")
      ?.body,
  ).toMatchObject({
    financialActivityId: 200,
    glAccountId: expect.any(Number),
  });
});

test("debit restrictions carry the required core reason and need an independent approver", async () => {
  const command = await run(
    createCommand(
      officer,
      { kind: "freeze", description: "Customer reported a lost phone" },
      "freeze-reason-001",
    ),
  );
  expect(postings).toHaveLength(0);
  expect((await failureOf(executeCommand(officer, command.id))).status).toBe(
    403,
  );
  await run(executeCommand(approver, command.id));
  expect(postings[0].path).toBe("savingsaccounts/101?command=blockDebit");
  expect(postings[0].body).toEqual({
    reasonForBlock: "Customer reported a lost phone",
  });
});

test("banking dates change at Indian midnight using an explicit clock instant", () => {
  expect(bankingDate(Date.UTC(2026, 9, 15, 18, 29, 59))).toBe("2026-10-15");
  expect(bankingDate(Date.UTC(2026, 9, 15, 18, 30))).toBe("2026-10-16");
});

describe("money boundaries", () => {
  test("uses exact minor units at the input boundary", () => {
    expect(moneyToMinor(0.01)).toBe(1);
    expect(moneyToMinor(1234.56)).toBe(123456);
  });
  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.001, 10000000.01])(
    "rejects invalid amount %s",
    (value) => expect(() => moneyToMinor(value)).toThrow(BankingError),
  );
  test("only a separate approver can approve", () => {
    expect(canApprove("officer", "officer")).toBe(false);
    expect(canApprove("customer", "officer")).toBe(false);
    expect(canApprove("approver", "approver")).toBe(false);
    expect(canApprove("approver", "officer")).toBe(true);
  });
});

describe("financial command lifecycle", () => {
  test("cash remains pending until separately approved and posts once", async () => {
    const command = await run(
      createCommand(
        officer,
        { kind: "deposit", amount: 1000 },
        "cash-deposit-001",
      ),
    );
    expect(command.status).toBe("pending");
    expect(postings).toHaveLength(0);
    expect((await failureOf(executeCommand(officer, command.id))).status).toBe(
      403,
    );
    expect(postings).toHaveLength(0);
    const result = await run(executeCommand(approver, command.id));
    expect(result.status).toBe("posted");
    expect(postings).toHaveLength(1);
    expect(postings[0].key).toBe(command.id);
    expect(postings[0].body).toMatchObject({ paymentTypeId: 1 });
    await run(executeCommand(approver, command.id));
    expect(postings).toHaveLength(1);
  });
  test("retail transfers debit and credit through one core account-transfer call", async () => {
    const input = {
      kind: "transfer" as const,
      amount: 2500,
      beneficiaryId: "arjun",
      description: "Shared expenses",
    };
    const first = await run(
      createCommand(customer, input, "transfer-unique-01"),
    );
    const replay = await run(
      createCommand(customer, input, "transfer-unique-01"),
    );
    expect(first.status).toBe("posted");
    expect(replay.id).toBe(first.id);
    expect(postings).toHaveLength(1);
    expect(lastBalance).toBe(7500);
    expect(postings[0].path).toBe("accounttransfers");
    expect(postings[0].body).toMatchObject({
      fromAccountId: "101",
      toAccountId: "102",
      transferAmount: "2500",
    });
  });
  test("reusing an idempotency key for another amount is rejected", async () => {
    await run(
      createCommand(
        officer,
        { kind: "deposit", amount: 1000 },
        "duplicate-key-001",
      ),
    );
    expect(
      (
        await failureOf(
          createCommand(
            officer,
            { kind: "deposit", amount: 2000 },
            "duplicate-key-001",
          ),
        )
      ).status,
    ).toBe(409);
    expect(postings).toHaveLength(0);
  });
  test("high value transfer waits for approval", async () => {
    const result = await run(
      createCommand(
        customer,
        { kind: "transfer", amount: 30000, beneficiaryId: "arjun" },
        "high-value-0001",
      ),
    );
    expect(result.status).toBe("pending");
    expect(postings).toHaveLength(0);
  });
  test("recipient from another workspace cannot be selected", async () => {
    const error = await failureOf(
      createCommand(
        { ...customer, bank_id: "other-bank" },
        { kind: "transfer", amount: 100, beneficiaryId: "arjun" },
        "cross-bank-0001",
      ),
    );
    expect(error.status).toBe(400);
    expect(postings).toHaveLength(0);
  });
  test("cannot approve another workspace's command", async () => {
    const command = await run(
      createCommand(
        officer,
        { kind: "deposit", amount: 1000 },
        "isolated-cash-001",
      ),
    );
    expect(
      (
        await failureOf(
          executeCommand({ ...approver, bank_id: "other-bank" }, command.id),
        )
      ).status,
    ).toBe(404);
    expect(postings).toHaveLength(0);
  });
  test("salary transfers employer funds rather than creating a deposit", async () => {
    const command = await run(
      createCommand(
        officer,
        { kind: "salary", amount: 5000 },
        "payroll-batch-001",
      ),
    );
    await run(executeCommand(approver, command.id));
    expect(postings[0].body).toMatchObject({
      fromClientId: "3",
      fromAccountId: "103",
      toClientId: "1",
      toAccountId: "101",
      transferAmount: "5000",
    });
  });
  test("rejected instruction has no financial effect", async () => {
    const command = await run(
      createCommand(
        officer,
        { kind: "withdrawal", amount: 500 },
        "reject-cash-0001",
      ),
    );
    await run(rejectCommand(approver, command.id));
    await run(executeCommand(approver, command.id));
    expect(postings).toHaveLength(0);
    expect(
      db.query("SELECT status FROM commands WHERE id=?").get(command.id),
    ).toEqual({ status: "rejected" });
  });
  test("uncertain core failures stay uncertain and cannot be blindly replayed", async () => {
    const command = await run(
      createCommand(
        officer,
        { kind: "deposit", amount: 1000 },
        "uncertain-0001",
      ),
    );
    coreFailure = new BankingError({
      message: "Connection lost after dispatch",
      status: 503,
      uncertain: true,
    });
    expect(
      (await failureOf(executeCommand(approver, command.id))).uncertain,
    ).toBe(true);
    coreFailure = undefined;
    const replay = await run(executeCommand(approver, command.id));
    expect(replay.status).toBe("uncertain");
    expect(
      (
        await failureOf(
          createCommand(
            officer,
            { kind: "deposit", amount: 1000 },
            "new-key-after-uncertainty",
          ),
        )
      ).status,
    ).toBe(409);
    expect(postings).toHaveLength(0);
  });
  test("declined transfer records failure without reporting success", async () => {
    lastBalance = 10;
    const error = await failureOf(
      createCommand(
        customer,
        { kind: "transfer", amount: 100, beneficiaryId: "arjun" },
        "insufficient-0001",
      ),
    );
    expect(error.message).toBe("Insufficient funds");
    expect(lastBalance).toBe(10);
    expect(
      db
        .query("SELECT status FROM commands WHERE key=?")
        .get("insufficient-0001"),
    ).toEqual({ status: "failed" });
  });
  test("customer cannot initiate a cash deposit", async () => {
    expect(
      (
        await failureOf(
          createCommand(
            customer,
            { kind: "deposit", amount: 1000 },
            "forbidden-00001",
          ),
        )
      ).status,
    ).toBe(403);
    expect(postings).toHaveLength(0);
  });
});

test("onboarding requires identity and address evidence", async () => {
  db.run("UPDATE banks SET customer_account=0 WHERE id='bank-one'");
  const error = await failureOf(
    submitApplication(customer, {
      name: "Mira Krishnan",
      email: "mira@example.test",
      phone: "9000000001",
      address: "14 Garden Lane Chennai",
      employment: "Designer",
    }),
  );
  expect(error.status).toBe(400);
  expect(error.message).toContain("identity and address");
  expect(postings).toHaveLength(0);
});
