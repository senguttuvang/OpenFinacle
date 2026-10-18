import { expect, test } from "bun:test";
import { Clock, Effect, Layer, Schema } from "effect";
import { loanRepayerLayer } from "../src/adapters/loan-repayments";
import { BankingError } from "../src/domain/banking";
import { CoreLoanSnapshot, LoanEnquiry } from "../src/domain/loan-engine";
import {
  LoanRepayer,
  type LoanRepayerService,
  validateRepaymentInstruction,
} from "../src/domain/loan-repayments";
import { loanTransactionLabel } from "../src/domain/loan-statements";
import { Core } from "../src/domain/ports";
import { inventedLoanProduct } from "./fixtures/loan-product";
import {
  repaymentAfter,
  repaymentBefore,
  repaymentFullTransfer,
  repaymentInstruction,
  repaymentLookup,
  repaymentSavings,
  repaymentSavingsAfter,
} from "./fixtures/loan-repayment";
import { workflowQuotedAt } from "./fixtures/loan-workflow";

interface Options {
  posted?: boolean;
  time?: number;
  advanceAfterRead?: number;
  before?: unknown;
  after?: unknown;
  savings?: unknown;
  savingsAfter?: unknown;
  product?: unknown;
  client?: unknown;
  full?: unknown;
  page?: unknown;
  ack?: unknown;
  postFailure?: BankingError;
  failedRead?: string;
}
const harness = (options: Options = {}) => {
  let posted = options.posted ?? false,
    time = options.time ?? workflowQuotedAt + 60000;
  const calls: {
    method: string;
    path: string;
    body?: unknown;
    key?: string;
  }[] = [];
  const ownedReads: boolean[] = [];
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.gen(function* () {
        calls.push({ method, path, body, key });
        if (method === "POST") {
          expect(path).toBe("accounttransfers");
          posted = options.postFailure?.uncertain !== false;
          if (options.postFailure)
            return yield* Effect.fail(options.postFailure);
          return (options.ack ?? { resourceId: 17, savingsId: 51 }) as T;
        }
        if (posted && options.failedRead === path)
          return yield* Effect.fail(
            new BankingError({
              message: "Invented private read cause",
              status: 404,
              uncertain: false,
            }),
          );
        if (path === "loanproducts/31")
          return (options.product ?? { ...inventedLoanProduct, id: 31 }) as T;
        if (path === "clients/41")
          return (options.client ?? { id: 41, officeId: 1, active: true }) as T;
        if (path === "savingsaccounts/51?associations=transactions")
          return structuredClone(
            posted
              ? (options.savingsAfter ?? repaymentSavingsAfter)
              : (options.savings ?? repaymentSavings),
          ) as T;
        if (path === "accounttransfers/92")
          return (options.full ?? repaymentFullTransfer) as T;
        if (path === "accounttransfers?accountDetailId=17")
          return (options.page ?? {
            totalFilteredRecords: 1,
            pageItems: [repaymentFullTransfer],
          }) as T;
        if (path.startsWith("accounttransfers?accountDetailId="))
          return { totalFilteredRecords: 0, pageItems: [] } as T;
        return yield* Effect.fail(
          new BankingError({ message: "Unexpected Core request", status: 500 }),
        );
      }),
  });
  const enquiries = Layer.succeed(LoanEnquiry, {
    inspect: () =>
      Effect.fail(
        new BankingError({
          message: "Repayment must use its statement enquiry",
          status: 500,
        }),
      ),
    confirmDisbursement: () =>
      Effect.fail(
        new BankingError({ message: "Unexpected funding proof", status: 500 }),
      ),
    statement: () =>
      Effect.gen(function* () {
        ownedReads.push(posted);
        if (options.advanceAfterRead) time = options.advanceAfterRead;
        if (posted && options.failedRead === "loan")
          return yield* Effect.fail(
            new BankingError({
              message: "Invented private loan cause",
              status: 404,
            }),
          );
        return yield* Schema.decodeUnknown(CoreLoanSnapshot)(
          structuredClone(
            posted
              ? (options.after ?? repaymentAfter)
              : (options.before ?? repaymentBefore),
          ),
        ).pipe(
          Effect.mapError(
            () =>
              new BankingError({
                message: "Invented invalid Core observation",
                status: 503,
              }),
          ),
        );
      }),
  });
  const clock = {
    ...Clock.make(),
    currentTimeMillis: Effect.sync(() => time),
    unsafeCurrentTimeMillis: () => time,
  };
  const run = <A, E>(
    select: (service: LoanRepayerService) => Effect.Effect<A, E>,
  ) =>
    Effect.runPromise(
      Effect.flatMap(LoanRepayer, select).pipe(
        Effect.provide(loanRepayerLayer),
        Effect.provide(Layer.mergeAll(core, enquiries)),
        Effect.withClock(clock),
      ),
    );
  return {
    calls,
    ownedReads,
    quote: (amount = 100000) => run((s) => s.quote(repaymentLookup, amount)),
    quoteDenied: (amount = 100000) =>
      run((s) => Effect.flip(s.quote(repaymentLookup, amount))),
    dispatch: (input = repaymentInstruction) => run((s) => s.dispatch(input)),
    dispatchDenied: (input = repaymentInstruction) =>
      run((s) => Effect.flip(s.dispatch(input))),
    confirm: (input = repaymentInstruction) => run((s) => s.confirm(input)),
    confirmDenied: (input = repaymentInstruction) =>
      run((s) => Effect.flip(s.confirm(input))),
  };
};
test("partial offer is read only and one dispatch correlates the exact savings withdrawal, loan allocation and full transfer", async () => {
  const quote = harness();
  const preview = await quote.quote();
  expect(preview.offer.amount_minor).toBe(100000);
  expect(preview.offer.office_id).toBe(1);
  expect(preview.offer.principal_outstanding_minor).toBe(1200000);
  expect(quote.calls.every((call) => call.method === "GET")).toBe(true);
  const h = harness();
  const result = await h.dispatch();
  expect(result).toMatchObject({
    operation_id: repaymentInstruction.operation_id,
    loan_transaction_id: 82,
    savings_transaction_id: 102,
    transfer_id: 92,
    amount_minor: 100000,
    principal_minor: 90000,
    interest_minor: 10000,
  });
  expect(h.calls.filter((c) => c.method === "POST")).toEqual([
    {
      method: "POST",
      path: "accounttransfers",
      key: repaymentInstruction.key,
      body: {
        locale: "en",
        dateFormat: "yyyy-MM-dd",
        fromOfficeId: 1,
        toOfficeId: 1,
        fromClientId: 41,
        toClientId: 41,
        fromAccountType: 2,
        toAccountType: 1,
        fromAccountId: 51,
        toAccountId: 71,
        transferDate: "2026-10-17",
        transferAmount: 1000,
        transferDescription: repaymentFullTransfer.transferDescription,
      },
    },
  ]);
  expect(
    h.calls.some((c) => c.path === "accounttransfers?accountDetailId=17"),
  ).toBe(true);
  expect(loanTransactionLabel(10)).toBe("Accrual");
});
test("Core ISO savings-transfer dates permit quotes and preserve exact one-time repayment proof", async () => {
  const row = repaymentSavingsAfter.transactions[0];
  const savingsAfter = {
    ...repaymentSavingsAfter,
    transactions: [
      { ...row, transfer: { ...row.transfer, transferDate: "2026-10-17" } },
    ],
  };
  const savings = {
    ...repaymentSavings,
    transactions: [
      {
        ...row,
        transfer: {
          ...row.transfer,
          transferDate: "2026-10-16",
          transferDescription: "invented unrelated transfer",
        },
      },
    ],
  };
  const quoted = harness({ savings });
  expect((await quoted.quote()).offer.available_minor).toBe(2000000);
  expect(quoted.calls.every((call) => call.method === "GET")).toBe(true);
  const h = harness({ savings, savingsAfter });
  expect((await h.dispatch()).savings_transaction_id).toBe(102);
  expect(h.calls.filter((call) => call.method === "POST")).toHaveLength(1);
  const readOnly = harness({ posted: true, savingsAfter });
  expect((await readOnly.confirm()).transfer_id).toBe(92);
  expect(readOnly.calls.every((call) => call.method === "GET")).toBe(true);
  for (const transferDate of [
    "2026-02-30",
    "2026-10-17T00:00:00Z",
    "17/10/2026",
    "2026-10-18",
  ]) {
    const invalid = harness({
      posted: true,
      savingsAfter: {
        ...savingsAfter,
        transactions: [{ ...row, transfer: { ...row.transfer, transferDate } }],
      },
    });
    expect((await invalid.confirmDenied()).uncertain).toBe(true);
    expect(invalid.calls.every((call) => call.method === "GET")).toBe(true);
  }
});
test("invalid amount, changed ownership/product/fees/budget or expired authorization sends no transfer", async () => {
  for (const amount of [9999, 10000.1, 50000001]) {
    const h = harness();
    expect((await h.quoteDenied(amount)).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  }
  for (const options of [
    {
      product: {
        ...inventedLoanProduct,
        id: 31,
        annualInterestRate: 99,
        interestRatePerPeriod: 2,
      },
    },
    { client: { id: 99, officeId: 1, active: true } },
    { savings: { ...repaymentSavings, clientId: 99 } },
    { savings: { ...repaymentSavings, status: { active: false } } },
    { savings: { ...repaymentSavings, withdrawalFeeForTransfers: true } },
    { savings: { ...repaymentSavings, summary: { availableBalance: 500 } } },
    {
      before: {
        ...repaymentBefore,
        owner: { ...repaymentBefore.owner, bank_id: "foreign-bank" },
      },
    },
    { before: { ...repaymentBefore, statement: undefined } },
    { time: workflowQuotedAt + 900000 },
    { advanceAfterRead: workflowQuotedAt + 900001 },
  ]) {
    const h = harness(options);
    await h.dispatchDenied();
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  }
  expect((await harness().quoteDenied(1200000)).status).toBe(409);
});
test("original keys, consent and Indian-day expiry remain strict while later read-only confirmation retains the original day", async () => {
  for (const input of [
    { ...repaymentInstruction, key: "another-original" },
    { ...repaymentInstruction, note: "    " },
    { ...repaymentInstruction, consented_at: workflowQuotedAt - 1 },
    { ...repaymentInstruction, consented_at: workflowQuotedAt + 900000 },
    {
      ...repaymentInstruction,
      offer: {
        ...repaymentInstruction.offer,
        external_id: "another-owned-loan",
      },
    },
    {
      ...repaymentInstruction,
      offer: {
        ...repaymentInstruction.offer,
        expires_at: workflowQuotedAt + 900001,
      },
    },
  ])
    expect(
      await Effect.runPromise(
        validateRepaymentInstruction(
          input,
          workflowQuotedAt + 60000,
          "dispatch",
        ).pipe(Effect.flip),
      ),
    ).toBeInstanceOf(BankingError);
  const later = harness({
    posted: true,
    time: workflowQuotedAt + 86400000,
    savingsAfter: {
      ...repaymentSavingsAfter,
      status: { active: false },
      withdrawalFeeForTransfers: true,
    },
  });
  expect((await later.confirm()).transfer_id).toBe(92);
  expect(later.calls.every((call) => call.method === "GET")).toBe(true);
  const midnight = Date.parse("2026-10-17T18:29:00Z");
  const original = {
    ...repaymentInstruction,
    consented_at: midnight + 1000,
    offer: {
      ...repaymentInstruction.offer,
      quoted_at: midnight,
      expires_at: midnight + 900000,
    },
  };
  expect(
    await Effect.runPromise(
      validateRepaymentInstruction(original, midnight + 60000, "dispatch").pipe(
        Effect.flip,
      ),
    ),
  ).toBeInstanceOf(BankingError);
  expect(
    await Effect.runPromise(
      validateRepaymentInstruction(original, midnight + 60000, "confirm"),
    ),
  ).toMatchObject({ operation_id: original.operation_id });
});
test("lost or malformed acknowledgements and every post-write proof-read failure remain uncertain without any replay", async () => {
  for (const options of [
    {
      postFailure: new BankingError({
        message: "Invented secret failure",
        status: 503,
        uncertain: true,
      }),
    },
    { ack: {} },
    { ack: { resourceId: 17.5, savingsId: 51 } },
    { ack: { resourceId: 17, savingsId: 999 } },
    { ack: { resourceId: 99, savingsId: 51 } },
    { failedRead: "loan" },
    { failedRead: "savingsaccounts/51?associations=transactions" },
    { failedRead: "accounttransfers/92" },
    { failedRead: "accounttransfers?accountDetailId=17" },
    {
      page: {
        totalFilteredRecords: 1,
        pageItems: [{ ...repaymentFullTransfer, fromClient: { id: 99 } }],
      },
    },
    {
      page: {
        totalFilteredRecords: 1,
        pageItems: [{ ...repaymentFullTransfer, transferAmount: 999 }],
      },
    },
    {
      page: {
        totalFilteredRecords: 1,
        pageItems: [{ ...repaymentFullTransfer, transferDate: "2026-10-18" }],
      },
    },
  ]) {
    const h = harness(options);
    const error = await h.dispatchDenied();
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("secret");
    expect(error.message).not.toContain("private");
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  }
  const lost = harness({
    postFailure: new BankingError({
      message: "Lost acknowledgement",
      status: 503,
      uncertain: true,
    }),
  });
  await lost.dispatchDenied();
  expect((await lost.confirm()).transfer_id).toBe(92);
  expect(lost.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  const rejected = harness({
    postFailure: new BankingError({
      message: "Private rejection",
      status: 422,
      uncertain: false,
    }),
  });
  expect((await rejected.dispatchDenied()).uncertain).toBe(false);
  expect(rejected.calls.filter((c) => c.method === "POST")).toHaveLength(1);
});
test("absent, duplicated, cash, reversed, wrong-owner or mismatched transfer evidence never confirms a repayment", async () => {
  const paidRow = repaymentAfter.statement.transactions[1];
  const withdrawal = repaymentSavingsAfter.transactions[0];
  for (const options of [
    { after: repaymentBefore, savingsAfter: repaymentSavings },
    {
      after: {
        ...repaymentAfter,
        statement: {
          ...repaymentAfter.statement,
          transactions: [
            ...repaymentAfter.statement.transactions,
            { ...paidRow, id: 83 },
          ],
        },
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [withdrawal, withdrawal],
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [{ ...withdrawal, reversed: true }],
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [{ ...withdrawal, isReversal: true }],
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [{ ...withdrawal, amount: 999 }],
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [{ ...withdrawal, transfer: null }],
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [{ ...withdrawal, transactionType: { id: 1 } }],
      },
    },
    {
      savingsAfter: {
        ...repaymentSavingsAfter,
        transactions: [{ ...withdrawal, accountId: 99 }],
      },
    },
    {
      after: {
        ...repaymentAfter,
        statement: {
          ...repaymentAfter.statement,
          transactions: [
            repaymentAfter.statement.transactions[0],
            { ...paidRow, transfer: null },
          ],
        },
      },
    },
    { full: { ...repaymentFullTransfer, reversed: true } },
    { full: { ...repaymentFullTransfer, fromAccount: { id: 99 } } },
    { full: { ...repaymentFullTransfer, toAccount: { id: 99 } } },
    { full: { ...repaymentFullTransfer, fromClient: { id: 99 } } },
    { full: { ...repaymentFullTransfer, toClient: { id: 99 } } },
    { full: { ...repaymentFullTransfer, fromOffice: { id: 99 } } },
    { full: { ...repaymentFullTransfer, transferDate: "2026-10-18" } },
    { full: { ...repaymentFullTransfer, transferAmount: 999 } },
    {
      full: {
        ...repaymentFullTransfer,
        transferDescription: "another-original",
      },
    },
    {
      full: {
        ...repaymentFullTransfer,
        fromAccountType: { id: 1 },
        toAccountType: { id: 2 },
      },
    },
  ]) {
    const h = harness({ ...options, posted: true });
    expect((await h.confirmDenied()).uncertain).toBe(true);
    expect(h.calls.every((call) => call.method === "GET")).toBe(true);
  }
  const collision = harness({ posted: true });
  expect((await collision.dispatchDenied()).uncertain).toBe(true);
  expect(collision.calls.every((call) => call.method === "GET")).toBe(true);
});
