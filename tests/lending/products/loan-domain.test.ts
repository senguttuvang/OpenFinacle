import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import {
  LoanCommand,
  type LoanQuote,
  LoanRecord,
  LoanTerms,
  loanActions,
  loanAffordability,
  loanDecision,
  normalizeLoanTerms,
  validateLoanQuote,
} from "../../../src/platform/lending/domain/origination/loans";

const terms: LoanTerms = {
  product: "core-personal",
  principal: 12000,
  months: 12,
  purpose: "education",
  monthly_income: 30000,
  monthly_commitments: 5000,
  monthly_expenses: 10000,
};
const now = Date.parse("2026-10-17T09:00:00Z");
const owner = {
  bank_id: "example-bank",
  product_id: 11,
  client_id: 12,
  savings_account_id: 13,
};
// Invented schedule components test integrity, not the engine's interest formula.
const quote: LoanQuote = {
  ...owner,
  id: "example-quote",
  terms,
  quoted_at: now,
  expires_at: now + 900000,
  expected_disbursement_date: "2026-10-17",
  schedule: {
    currency: "INR",
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
const loan: LoanRecord = {
  id: "example-loan",
  bank_id: owner.bank_id,
  quote_id: quote.id,
  terms,
  status: "submitted",
  maker: null,
  checker: null,
  core_id: null,
  version: 0,
  withdrawal_requested: false,
};
const command = (action: LoanCommand["action"]): LoanCommand => ({
  id: loan.id,
  version: 0,
  action,
  note: "Reviewed synthetic loan instruction",
});
const denied = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(effect.pipe(Effect.flip));

test("loan terms reject unsupported products, amounts, tenures, private fields and impossible declared surplus", async () => {
  for (const input of [
    { ...terms, product: "bank-preapproved" },
    { ...terms, principal: 9000 },
    { ...terms, principal: 501000 },
    { ...terms, principal: 10500 },
    { ...terms, principal: 10000.5 },
    { ...terms, months: 18 },
    { ...terms, interestRate: 1 },
    { ...terms, creditScore: 800 },
    { ...terms, pan: "invented" },
    { ...terms, monthly_income: 4999 },
    { ...terms, monthly_commitments: -1 },
    { ...terms, monthly_expenses: 0.5 },
    { ...terms, monthly_income: 15000 },
  ])
    expect((await denied(normalizeLoanTerms(input))).status).toBe(400);
  expect(
    await Effect.runPromise(
      normalizeLoanTerms({ ...terms, monthly_expenses: 0 }),
    ),
  ).toEqual({ ...terms, monthly_expenses: 0 });
  expect(
    Schema.decodeUnknownEither(LoanTerms)({
      ...terms,
      principal: 500000,
      months: 36,
    })._tag,
  ).toBe("Right");
});

test("core quote validation binds all owned identities and canonical terms", async () => {
  expect(
    await Effect.runPromise(validateLoanQuote(quote, terms, owner, now)),
  ).toEqual(quote);
  for (const field of [
    "bank_id",
    "product_id",
    "client_id",
    "savings_account_id",
  ] as const) {
    const foreign = {
      ...owner,
      [field]: field === "bank_id" ? "another-bank" : 99,
    };
    expect(
      (await denied(validateLoanQuote(quote, terms, foreign, now))).status,
    ).toBe(403);
  }
  for (const changed of [
    { ...terms, principal: 13000 },
    { ...terms, purpose: "other" },
    { ...terms, monthly_expenses: 10001 },
  ])
    expect(
      (await denied(validateLoanQuote(quote, changed, owner, now))).status,
    ).toBe(409);
  const reordered = Object.fromEntries(Object.entries(terms).reverse());
  expect(
    await Effect.runPromise(
      validateLoanQuote({ ...quote, terms: reordered }, terms, owner, now),
    ),
  ).toEqual(quote);
  expect(
    (
      await denied(
        validateLoanQuote(
          { ...quote, schedule: { ...quote.schedule, currency: "USD" } },
          terms,
          owner,
          now,
        ),
      )
    ).status,
  ).toBe(503);
  expect(
    (await denied(validateLoanQuote({ ...quote, rate: 2 }, terms, owner, now)))
      .status,
  ).toBe(503);
});

test("quotes expire at fifteen minutes or Indian midnight without reading a system clock", async () => {
  expect(
    (
      await denied(
        validateLoanQuote(
          {
            ...quote,
            quoted_at: 9000000000000000,
            expires_at: 9000000000900000,
          },
          terms,
          owner,
          9000000000000000,
        ),
      )
    ).status,
  ).toBe(409);
  for (const instant of [
    now - 1,
    now + 900000,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])
    expect(
      (await denied(validateLoanQuote(quote, terms, owner, instant))).status,
    ).toBe(409);
  expect(
    await Effect.runPromise(
      validateLoanQuote(quote, terms, owner, now + 899999),
    ),
  ).toEqual(quote);
  expect(
    (
      await denied(
        validateLoanQuote(
          { ...quote, expires_at: now + 900001 },
          terms,
          owner,
          now,
        ),
      )
    ).status,
  ).toBe(409);
  const late = Date.parse("2026-10-17T18:29:59Z");
  const midnight = { ...quote, quoted_at: late, expires_at: late + 900000 };
  expect(
    await Effect.runPromise(validateLoanQuote(midnight, terms, owner, late)),
  ).toEqual(midnight);
  expect(
    (await denied(validateLoanQuote(midnight, terms, owner, late + 1000)))
      .status,
  ).toBe(409);
  expect(
    (
      await denied(
        validateLoanQuote(
          { ...quote, expected_disbursement_date: "2026-02-30" },
          terms,
          owner,
          now,
        ),
      )
    ).status,
  ).toBe(503);
});

test("core schedules require complete ordered periods, exact minor-unit totals and no unsupported charges", async () => {
  const rows = quote.schedule.installments;
  for (const schedule of [
    { ...quote.schedule, installments: rows.slice(1) },
    { ...quote.schedule, installments: [] },
    { ...quote.schedule, installments: [...rows].reverse() },
    {
      ...quote.schedule,
      installments: rows.map((row, i) =>
        i === 1 ? { ...row, due_date: rows[0].due_date } : row,
      ),
    },
    {
      ...quote.schedule,
      installments: rows.map((row, i) =>
        i === 0 ? { ...row, due_date: "2026-10-17" } : row,
      ),
    },
    {
      ...quote.schedule,
      installments: rows.map((row, i) =>
        i === 0 ? { ...row, principal_minor: 100001 } : row,
      ),
    },
    {
      ...quote.schedule,
      installments: rows.map((row, i) =>
        i === 0 ? { ...row, total_minor: 110000.5 } : row,
      ),
    },
    { ...quote.schedule, principal_minor: 1200001 },
    { ...quote.schedule, interest_minor: 0 },
    { ...quote.schedule, repayment_minor: 1320001 },
    { ...quote.schedule, fee_minor: 100 },
  ])
    expect(
      (
        await denied(
          validateLoanQuote({ ...quote, schedule }, terms, owner, now),
        )
      ).status,
    ).toBe(503);
});

test("declared affordability uses the largest installment and reserves existing commitments and living expenses", async () => {
  const uneven = {
    ...quote,
    terms: { ...terms, monthly_income: 16100 },
    schedule: {
      ...quote.schedule,
      interest_minor: 10001,
      repayment_minor: 1210001,
      installments: quote.schedule.installments.map((row, index) => ({
        ...row,
        interest_minor: index === 11 ? 10001 : 0,
        total_minor: index === 11 ? 110001 : 100000,
      })),
    },
  };
  expect(
    await Effect.runPromise(
      validateLoanQuote(uneven, uneven.terms, owner, now),
    ),
  ).toEqual(uneven);
  expect(loanAffordability(quote)).toEqual({
    maximum_installment_minor: 110000,
    surplus_minor: 1500000,
    within_declared_surplus: true,
  });
  expect(loanAffordability(uneven)).toEqual({
    maximum_installment_minor: 110001,
    surplus_minor: 110000,
    within_declared_surplus: false,
  });
  expect(
    loanAffordability({
      ...uneven,
      terms: { ...uneven.terms, monthly_income: 16101 },
    }).within_declared_surplus,
  ).toBe(true);
});

test("loan decisions separate customer cancellation, officer assessment and independent core stages", async () => {
  expect(Schema.decodeUnknownEither(LoanRecord)(loan)._tag).toBe("Right");
  expect(loanActions(loan, "customer", false)).toEqual(["cancel"]);
  expect(loanActions(loan, "officer", false)).toEqual(["recommend", "reject"]);
  expect(loanActions(loan, "approver", false)).toEqual([]);
  const recommendation = await Effect.runPromise(
    loanDecision(loan, command("recommend"), "officer", false),
  );
  expect(recommendation).toEqual({
    next_status: "recommended",
    maker: "officer",
    checker: null,
    core_command: null,
    withdrawal_requested: false,
    note: command("recommend").note,
  });
  const recommended: LoanRecord = {
    ...loan,
    status: "recommended",
    maker: "officer",
  };
  const registered: LoanRecord = {
    ...recommended,
    status: "registered",
    checker: "approver",
    core_id: 40,
  };
  for (const [record, action, next] of [
    [recommended, "register", "registered"],
    [registered, "approve", "approved"],
    [{ ...registered, status: "approved" }, "disburse", "active"],
  ] as const) {
    expect(loanActions(record, "officer", false)).toEqual([]);
    expect(loanActions(record, "customer", false)).toEqual(
      record.status === "recommended" ? ["cancel"] : ["request_withdrawal"],
    );
    const result = await Effect.runPromise(
      loanDecision(record, command(action), "approver", false),
    );
    expect(result.next_status).toBe(next);
    expect(result.core_command).toBe(action);
    expect(result.checker).toBe("approver");
  }
  expect(
    (
      await Effect.runPromise(
        loanDecision(loan, command("cancel"), "customer", false),
      )
    ).next_status,
  ).toBe("cancelled");
  expect(
    (
      await Effect.runPromise(
        loanDecision(recommended, command("reject"), "approver", false),
      )
    ).core_command,
  ).toBeNull();
});

test("unresolved core operations, stale versions, corrupt links and terminal records prohibit unsafe actions", async () => {
  const recommended: LoanRecord = {
    ...loan,
    status: "recommended",
    maker: "officer",
  };
  for (const role of ["customer", "officer", "approver"] as const) {
    expect(loanActions(recommended, role, true)).toEqual([]);
    expect(
      (await denied(loanDecision(recommended, command("register"), role, true)))
        .status,
    ).toBe(403);
    for (const status of [
      "active",
      "rejected",
      "cancelled",
      "withdrawn",
    ] as const)
      expect(loanActions({ ...loan, status }, role, false)).toEqual([]);
  }
  for (const record of [
    { ...loan, checker: "approver" },
    { ...recommended, maker: null },
    { ...recommended, core_id: 40 },
    {
      ...recommended,
      status: "registered",
      checker: "approver",
      core_id: null,
    },
    { ...recommended, status: "approved", checker: null, core_id: 40 },
  ] as const)
    expect(loanActions(record, "approver", false)).toEqual([]);
  for (const change of [{ version: 1 }, { id: "foreign-loan" }])
    expect(
      (
        await denied(
          loanDecision(
            loan,
            { ...command("recommend"), ...change },
            "officer",
            false,
          ),
        )
      ).status,
    ).toBe(409);
  for (const note of ["     ", "a".repeat(301)])
    expect(
      (
        await denied(
          loanDecision(
            loan,
            { ...command("recommend"), note },
            "officer",
            false,
          ),
        )
      ).status,
    ).toBe(400);
  expect(
    (await denied(loanDecision(loan, command("disburse"), "approver", false)))
      .status,
  ).toBe(403);
  expect(
    Schema.decodeUnknownEither(LoanCommand, { onExcessProperty: "error" })({
      ...command("recommend"),
      core_id: 100,
    })._tag,
  ).toBe("Left");
});

test("customer withdrawal blocks lending progression and requires separate approver undo and withdrawal stages", async () => {
  const approved: LoanRecord = {
    ...loan,
    status: "approved",
    maker: "officer",
    checker: "approver",
    core_id: 40,
  };
  const request = await Effect.runPromise(
    loanDecision(approved, command("request_withdrawal"), "customer", false),
  );
  expect(request.next_status).toBe("approved");
  expect(request.core_command).toBeNull();
  expect(request.withdrawal_requested).toBe(true);
  const pending = { ...approved, withdrawal_requested: true };
  expect(loanActions(pending, "approver", false)).toEqual(["undo_approval"]);
  for (const role of ["customer", "officer"] as const)
    expect(loanActions(pending, role, false)).toEqual([]);
  expect(loanActions(pending, "approver", true)).toEqual([]);
  expect(
    (
      await denied(
        loanDecision(pending, command("disburse"), "approver", false),
      )
    ).status,
  ).toBe(403);
  const undo = await Effect.runPromise(
    loanDecision(pending, command("undo_approval"), "approver", false),
  );
  expect(undo.next_status).toBe("registered");
  expect(undo.core_command).toBe("undo_approval");
  expect(undo.withdrawal_requested).toBe(true);
  const registered = { ...pending, status: "registered" as const };
  expect(loanActions(registered, "approver", false)).toEqual(["withdraw"]);
  const withdrawal = await Effect.runPromise(
    loanDecision(registered, command("withdraw"), "approver", false),
  );
  expect(withdrawal.next_status).toBe("withdrawn");
  expect(withdrawal.core_command).toBe("withdraw");
  expect(
    (
      await denied(
        loanDecision(approved, command("withdraw"), "approver", false),
      )
    ).status,
  ).toBe(403);
  expect(
    loanActions({ ...loan, withdrawal_requested: true }, "officer", false),
  ).toEqual([]);
});
