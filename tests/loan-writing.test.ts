import { expect, test } from "bun:test";
import { Clock, Effect, Layer } from "effect";
import { loanWriterLayer } from "../src/adapters/loan-writing";
import { BankingError } from "../src/domain/banking";
import { type CoreLoanSnapshot, LoanEnquiry } from "../src/domain/loan-engine";
import {
  type LoanWriteInstruction,
  LoanWriter,
} from "../src/domain/loan-writing";
import { Core } from "../src/domain/ports";
import { inventedLoanProduct } from "./fixtures/loan-product";

const quoted = Date.parse("2026-10-17T09:00:00Z");
const terms = {
  product: "core-personal",
  principal: 12000,
  months: 12,
  purpose: "education",
  monthly_income: 30000,
  monthly_commitments: 5000,
  monthly_expenses: 10000,
} as const;
const owner = {
  bank_id: "invented-bank",
  product_id: 11,
  client_id: 12,
  savings_account_id: 13,
};
const quote = {
  ...owner,
  id: "invented-quote",
  terms,
  quoted_at: quoted,
  expires_at: quoted + 900000,
  expected_disbursement_date: "2026-10-17",
  schedule: {
    currency: "INR" as const,
    principal_minor: 1200000,
    interest_minor: 120000,
    repayment_minor: 1320000,
    installments: Array.from({ length: 12 }, (_, index) => ({
      period: index + 1,
      due_date: new Date(Date.UTC(2026, 10 + index, 17))
        .toISOString()
        .slice(0, 10),
      principal_minor: 100000,
      interest_minor: 10000,
      total_minor: 110000,
    })),
  },
};
const instruction = (
  action: LoanWriteInstruction["action"],
): LoanWriteInstruction => ({
  owner,
  terms,
  quote,
  consented_at: quoted + 30000,
  expected_disbursement_date: "2026-10-17",
  external_id: "of-loan-invented",
  action,
  key: `of-operation-${action}`,
  date: "2026-10-17",
  note: "Reviewed original invented instruction",
  ...(action === "register" ? {} : { core_id: 21 }),
  ...(action === "disburse"
    ? { transaction_external_id: "of-disburse-invented" }
    : {}),
});
const snapshot = (
  status: CoreLoanSnapshot["status"],
  date = "2026-10-17",
): CoreLoanSnapshot => ({
  id: 21,
  external_id: "of-loan-invented",
  owner,
  status,
  principal_minor: 1200000,
  annual_rate_bps: 1200,
  expected_disbursement_date: "2026-10-17",
  submitted_on_date: "2026-10-17",
  approved_on_date:
    status === "approved" || status === "active" ? "2026-10-17" : null,
  withdrawn_on_date: status === "withdrawn" ? date : null,
  actual_disbursement_date: status === "active" ? date : null,
  principal_disbursed_minor: status === "active" ? 1200000 : null,
  principal_outstanding_minor: status === "active" ? 1200000 : null,
  outstanding_minor: status === "active" ? 1320000 : null,
  schedule: status === "active" ? quote.schedule : null,
  disbursements: [],
});
interface Options {
  time?: number;
  advanceAfterRead?: number;
  ack?: unknown;
  postFailure?: BankingError;
  readFailure?: boolean;
  before?: CoreLoanSnapshot;
  after?: CoreLoanSnapshot;
  product?: unknown;
  account?: unknown;
}
const harness = (input: LoanWriteInstruction, options: Options = {}) => {
  let time = options.time ?? quoted + 60000;
  let posted = false;
  const calls: {
    method: string;
    path: string;
    body?: unknown;
    key?: string;
  }[] = [];
  const inspections: { afterPost: boolean; coreId?: number }[] = [];
  const target =
    input.action === "approve"
      ? "approved"
      : input.action === "disburse"
        ? "active"
        : input.action === "withdraw"
          ? "withdrawn"
          : "registered";
  const required =
    input.action === "approve" || input.action === "withdraw"
      ? "registered"
      : "approved";
  const inspect = () =>
    Effect.gen(function* () {
      if (options.advanceAfterRead) time = options.advanceAfterRead;
      if (options.readFailure && posted)
        return yield* Effect.fail(
          new BankingError({ message: "synthetic-private-error", status: 404 }),
        );
      return posted
        ? (options.after ?? snapshot(target, input.date))
        : (options.before ?? snapshot(required));
    });
  const core = Layer.succeed(Core, {
    request: <T>(method: string, path: string, body?: unknown, key?: string) =>
      Effect.gen(function* () {
        calls.push({ method, path, body, key });
        if (method === "GET") {
          if (options.advanceAfterRead) time = options.advanceAfterRead;
          if (path === "loanproducts/11")
            return (options.product ?? inventedLoanProduct) as T;
          if (path === "savingsaccounts/13")
            return (options.account ?? {
              id: 13,
              clientId: 12,
              currency: { code: "INR", decimalPlaces: 2 },
              status: { active: true },
            }) as T;
          return yield* Effect.fail(
            new BankingError({ message: "Unexpected read", status: 500 }),
          );
        }
        if (options.postFailure) return yield* Effect.fail(options.postFailure);
        posted = true;
        return (
          options.ack === undefined ? { resourceId: 21 } : options.ack
        ) as T;
      }),
  });
  const enquiry = Layer.succeed(LoanEnquiry, {
    statement: () =>
      Effect.fail(
        new BankingError({
          message: "Financial proof must not request a statement",
          status: 500,
        }),
      ),
    inspect: (lookup) => {
      inspections.push({ afterPost: posted, coreId: lookup.core_id });
      expect(lookup.external_id).toBe(input.external_id);
      expect(lookup.owner).toEqual(owner);
      return inspect();
    },
    confirmDisbursement: (lookup) =>
      Effect.gen(function* () {
        if (!input.transaction_external_id)
          return yield* Effect.fail(
            new BankingError({
              message: "Unexpected proof without original correlation",
              status: 500,
            }),
          );
        expect(lookup.transaction_external_id).toBe(
          input.transaction_external_id,
        );
        const loan = yield* inspect();
        return {
          loan,
          transaction_id: 31,
          transfer_id: 51,
          date: input.date,
          amount_minor: 1200000,
        };
      }),
  });
  const clock = {
    ...Clock.make(),
    currentTimeMillis: Effect.sync(() => time),
    unsafeCurrentTimeMillis: () => time,
  };
  const task = (mode: "dispatch" | "confirm", original = input) =>
    Effect.gen(function* () {
      const writer = yield* LoanWriter;
      if (mode === "confirm") posted = true; // Represents the saved original operation's already completed Core effect.
      return yield* writer[mode](original);
    }).pipe(
      Effect.provide(loanWriterLayer),
      Effect.provide(Layer.merge(core, enquiry)),
      Effect.withClock(clock),
    );
  return {
    calls,
    inspections,
    run: (mode: "dispatch" | "confirm" = "dispatch") =>
      Effect.runPromise(task(mode)),
    denied: (mode: "dispatch" | "confirm" = "dispatch", original = input) =>
      Effect.runPromise(task(mode, original).pipe(Effect.flip)),
  };
};

test("each lifecycle stage sends one exact original keyed Core command and corroborates its resulting state", async () => {
  const routes = {
    register: "loans",
    approve: "loans/21?command=approve",
    disburse: "loans/21?command=disburseToSavings",
    undo_approval: "loans/21?command=undoapproval",
    withdraw: "loans/21?command=withdrawnByApplicant",
  };
  for (const action of Object.keys(
    routes,
  ) as LoanWriteInstruction["action"][]) {
    const input = instruction(action);
    const h = harness(input);
    const result = await h.run();
    const writes = h.calls.filter((c) => c.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(routes[action]);
    expect(writes[0].key).toBe(input.key);
    expect(result.loan.id).toBe(21);
    if (action === "register") {
      expect(writes[0].body).toMatchObject({
        loanType: "individual",
        principal: 12000,
        productId: 11,
        clientId: 12,
        externalId: input.external_id,
        linkAccountId: 13,
        submittedOnDate: input.date,
        expectedDisbursementDate: input.date,
        createStandingInstructionAtDisbursement: false,
      });
      expect(h.inspections).toEqual([{ afterPost: true, coreId: 21 }]);
    } else if (action === "undo_approval") {
      expect(writes[0].body).toEqual({ note: input.note });
      expect(result.loan.status).toBe("registered");
    } else if (action === "disburse") {
      expect(writes[0].body).toMatchObject({
        actualDisbursementDate: input.date,
        transactionAmount: 12000,
        externalId: input.transaction_external_id,
      });
      expect(result).toMatchObject({ transaction_id: 31, transfer_id: 51 });
    } else if (action === "approve")
      expect(writes[0].body).toMatchObject({
        approvedOnDate: input.date,
        approvedLoanAmount: 12000,
      });
    else expect(writes[0].body).toMatchObject({ withdrawnOnDate: input.date });
    if (action === "undo_approval" || action === "withdraw")
      expect(h.calls.filter((c) => c.method === "GET")).toHaveLength(0);
  }
});

test("unreadable acknowledgements, wrong IDs or failed post-write reads retain uncertainty without another POST", async () => {
  for (const [action, options] of [
    ["register", { ack: {} }],
    ["approve", { ack: { resourceId: 99 } }],
    ["register", { readFailure: true }],
    ["approve", { after: snapshot("registered") }],
    [
      "withdraw",
      { after: { ...snapshot("withdrawn"), withdrawn_on_date: "2026-10-18" } },
    ],
    ["disburse", { after: { ...snapshot("active"), schedule: null } }],
  ] as const) {
    const h = harness(instruction(action), options);
    const error = await h.denied();
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("synthetic-private-error");
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  }
});

test("definite Core rejection stays definite while ambiguous conflict/server outcomes retain the original instruction", async () => {
  for (const ambiguous of [false, true]) {
    const h = harness(instruction("register"), {
      postFailure: new BankingError({
        message: "synthetic-private-error",
        status: ambiguous ? 503 : 422,
        uncertain: ambiguous,
      }),
    });
    const error = await h.denied();
    expect(error.uncertain === true).toBe(ambiguous);
    expect(error.status).toBe(ambiguous ? 503 : 422);
    expect(error.message).not.toContain("synthetic-private-error");
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(h.inspections).toHaveLength(0);
  }
});

test("ownership/configuration and pre-state failures happen before any Core write", async () => {
  for (const options of [
    {
      account: {
        id: 13,
        clientId: 99,
        currency: { code: "INR", decimalPlaces: 2 },
        status: { active: true },
      },
    },
    { product: { ...inventedLoanProduct, enableDownPayment: true } },
    { before: snapshot("active") },
  ]) {
    const h = harness(instruction("approve"), options);
    expect((await h.denied()).uncertain).not.toBe(true);
    expect(h.calls.every((c) => c.method === "GET")).toBe(true);
  }
});

test("expired registration, banking-day rollover and a deadline crossed during reads cannot reach Core dispatch", async () => {
  for (const [action, options] of [
    ["register", { time: quoted + 900000 }],
    ["approve", { time: Date.parse("2026-10-17T18:30:00Z") }],
    ["register", { advanceAfterRead: quoted + 900000 }],
    ["disburse", { advanceAfterRead: Date.parse("2026-10-17T18:30:00Z") }],
  ] as const) {
    const h = harness(instruction(action), options);
    expect((await h.denied()).status).toBe(409);
    expect(h.calls.every((c) => c.method === "GET")).toBe(true);
  }
  expect(
    (await harness(instruction("approve"), { time: quoted + 3600000 }).run())
      .loan.status,
  ).toBe("approved");
});

test("later-day withdrawal and read-only confirmation preserve the accepted quote instead of refreshing or replaying it", async () => {
  const time = Date.parse("2026-10-18T09:00:00Z");
  for (const action of ["undo_approval", "withdraw"] as const) {
    const h = harness({ ...instruction(action), date: "2026-10-18" }, { time });
    await h.run();
    expect(h.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  }
  for (const action of [
    "register",
    "approve",
    "disburse",
    "undo_approval",
    "withdraw",
  ] as const) {
    const h = harness(instruction(action), { time });
    await h.run("confirm");
    expect(h.calls).toHaveLength(0);
  }
  const missing = harness(instruction("register"), { time, readFailure: true });
  expect((await missing.denied("confirm")).uncertain).toBe(true);
  expect(missing.calls).toHaveLength(0);
});

test("original instruction validation rejects identity, quote, correlation and consent tampering before any read", async () => {
  const original = instruction("register");
  for (const change of [
    { core_id: 21 },
    { external_id: "../../bad" },
    { key: "short" },
    { note: "     " },
    { transaction_external_id: "unexpected-disbursement" },
    { owner: { ...owner, client_id: 99 } },
    { terms: { ...terms, principal: 13000 } },
    { consented_at: quoted + 900000 },
    { consented_at: quoted + 120000 },
    { quote: { ...quote, expires_at: quoted + 901000 } },
    { unexpected: true },
  ]) {
    const h = harness(original);
    const error = await h.denied("dispatch", { ...original, ...change });
    expect(error).toBeInstanceOf(BankingError);
    expect(h.calls).toHaveLength(0);
  }
  for (const input of [
    { ...instruction("approve"), core_id: undefined },
    { ...instruction("disburse"), transaction_external_id: undefined },
  ]) {
    const h = harness(input);
    expect((await h.denied()).status).toBe(400);
    expect(h.calls).toHaveLength(0);
  }
});
