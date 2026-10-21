import { Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Role,
} from "../../../banking-workspace/domain/banking";

const money = Schema.Number.pipe(Schema.int(), Schema.between(0, 100000000));
const identifier = Schema.Number.pipe(Schema.int(), Schema.positive());
const calendarDate = Schema.String.pipe(
  Schema.filter((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const instant = Date.parse(`${value}T00:00:00Z`);
    return (
      Number.isFinite(instant) &&
      new Date(instant).toISOString().slice(0, 10) === value
    );
  }),
);
export const LoanTerms = Schema.Struct({
  product: Schema.Literal("core-personal"),
  principal: Schema.Number.pipe(
    Schema.int(),
    Schema.between(10000, 500000),
    Schema.filter((value) => value % 1000 === 0),
  ),
  months: Schema.Literal(12, 24, 36),
  purpose: Schema.Literal("home", "education", "medical", "other"),
  monthly_income: Schema.Number.pipe(
    Schema.int(),
    Schema.between(5000, 1000000),
  ),
  monthly_commitments: Schema.Number.pipe(
    Schema.int(),
    Schema.between(0, 1000000),
  ),
  monthly_expenses: Schema.Number.pipe(
    Schema.int(),
    Schema.between(0, 1000000),
  ),
});
export type LoanTerms = typeof LoanTerms.Type;
const Installment = Schema.Struct({
  period: Schema.Number.pipe(Schema.int(), Schema.between(1, 36)),
  due_date: calendarDate,
  principal_minor: money,
  interest_minor: money,
  total_minor: money,
});
export const LoanOwner = Schema.Struct({
  bank_id: Schema.NonEmptyString,
  product_id: identifier,
  client_id: identifier,
  savings_account_id: identifier,
});
export type LoanOwner = typeof LoanOwner.Type;
export const LoanSchedule = Schema.Struct({
  currency: Schema.Literal("INR"),
  principal_minor: money,
  interest_minor: money,
  repayment_minor: money,
  installments: Schema.Array(Installment),
});
export type LoanSchedule = typeof LoanSchedule.Type;
export const LoanQuote = Schema.Struct({
  id: Schema.NonEmptyString,
  ...LoanOwner.fields,
  terms: LoanTerms,
  expected_disbursement_date: calendarDate,
  quoted_at: identifier,
  expires_at: identifier,
  schedule: LoanSchedule,
});
export type LoanQuote = typeof LoanQuote.Type;
const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const normalized = (terms: LoanTerms): LoanTerms => ({
  product: terms.product,
  principal: terms.principal,
  months: terms.months,
  purpose: terms.purpose,
  monthly_income: terms.monthly_income,
  monthly_commitments: terms.monthly_commitments,
  monthly_expenses: terms.monthly_expenses,
});
export const normalizeLoanTerms = (input: unknown) =>
  Schema.decodeUnknown(LoanTerms, { onExcessProperty: "error" })(input).pipe(
    Effect.map(normalized),
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Choose valid demo loan terms and whole-rupee income details.",
          status: 400,
        }),
    ),
    Effect.flatMap((terms) =>
      terms.monthly_income > terms.monthly_commitments + terms.monthly_expenses
        ? Effect.succeed(terms)
        : fail(
            "Declared expenses and commitments leave no repayment surplus.",
            400,
          ),
    ),
  );

export const validateLoanQuote = (
  input: unknown,
  requestedTerms: unknown,
  owner: LoanOwner,
  now: number,
) =>
  Effect.gen(function* () {
    const terms = yield* normalizeLoanTerms(requestedTerms);
    const quote = yield* Schema.decodeUnknown(LoanQuote, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "The saved core loan quote could not be verified. Obtain a new quote.",
            status: 503,
          }),
      ),
    );
    if (
      quote.bank_id !== owner.bank_id ||
      quote.product_id !== owner.product_id ||
      quote.client_id !== owner.client_id ||
      quote.savings_account_id !== owner.savings_account_id
    )
      return yield* fail(
        "This quote does not belong to the current relationship and product.",
        403,
      );
    if (JSON.stringify(normalized(quote.terms)) !== JSON.stringify(terms))
      return yield* fail(
        "Loan terms changed. Obtain and review a new core quote.",
      );
    if (
      !Number.isSafeInteger(now) ||
      !Number.isFinite(new Date(now).getTime()) ||
      !Number.isFinite(new Date(quote.quoted_at).getTime()) ||
      now < quote.quoted_at ||
      now >= quote.expires_at ||
      quote.expires_at !== quote.quoted_at + 15 * 60 * 1000 ||
      quote.expected_disbursement_date !== bankingDate(quote.quoted_at) ||
      quote.expected_disbursement_date !== bankingDate(now)
    )
      return yield* fail(
        "This quote expired or its banking date changed. Obtain a new quote.",
      );
    yield* validateLoanSchedule(
      quote.schedule,
      terms,
      quote.expected_disbursement_date,
    );
    return quote;
  });

export const validateLoanSchedule = (
  input: unknown,
  terms: LoanTerms,
  disbursementDate: string,
) =>
  Effect.gen(function* () {
    yield* Schema.decodeUnknown(calendarDate)(disbursementDate).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "The core loan date could not be verified.",
            status: 503,
          }),
      ),
    );
    const schedule = yield* Schema.decodeUnknown(LoanSchedule, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "The core repayment schedule could not be verified.",
            status: 503,
          }),
      ),
    );
    const rows = schedule.installments;
    if (
      rows.length !== terms.months ||
      rows.some(
        (row, index) =>
          row.period !== index + 1 ||
          row.due_date <=
            (index === 0 ? disbursementDate : rows[index - 1].due_date) ||
          row.total_minor <= 0 ||
          row.principal_minor + row.interest_minor !== row.total_minor,
      ) ||
      schedule.principal_minor !== terms.principal * 100 ||
      schedule.interest_minor <= 0 ||
      rows.reduce((sum, row) => sum + row.principal_minor, 0) !==
        schedule.principal_minor ||
      rows.reduce((sum, row) => sum + row.interest_minor, 0) !==
        schedule.interest_minor ||
      rows.reduce((sum, row) => sum + row.total_minor, 0) !==
        schedule.repayment_minor ||
      schedule.principal_minor + schedule.interest_minor !==
        schedule.repayment_minor
    )
      return yield* fail(
        "The core repayment schedule is incomplete or inconsistent. Obtain a new quote.",
        503,
      );
    return schedule;
  });

// Consume a validated quote; this declared-budget check does not approve credit.
export const loanAffordability = (quote: LoanQuote) => {
  const maximum_installment_minor = Math.max(
    ...quote.schedule.installments.map((row) => row.total_minor),
  );
  const surplus_minor =
    (quote.terms.monthly_income -
      quote.terms.monthly_commitments -
      quote.terms.monthly_expenses) *
    100;
  return {
    maximum_installment_minor,
    surplus_minor,
    within_declared_surplus: maximum_installment_minor <= surplus_minor,
  };
};

export const LoanRecord = Schema.Struct({
  id: Schema.NonEmptyString,
  bank_id: Schema.NonEmptyString,
  quote_id: Schema.NonEmptyString,
  terms: LoanTerms,
  status: Schema.Literal(
    "submitted",
    "recommended",
    "registered",
    "approved",
    "active",
    "rejected",
    "cancelled",
    "withdrawn",
  ),
  withdrawal_requested: Schema.Boolean,
  maker: Schema.NullOr(Schema.Literal("officer")),
  checker: Schema.NullOr(Schema.Literal("approver")),
  core_id: Schema.NullOr(identifier),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});
export type LoanRecord = typeof LoanRecord.Type;
export const LoanCommand = Schema.Struct({
  id: Schema.NonEmptyString,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  action: Schema.Literal(
    "recommend",
    "register",
    "approve",
    "disburse",
    "reject",
    "cancel",
    "request_withdrawal",
    "undo_approval",
    "withdraw",
  ),
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
});
export type LoanCommand = typeof LoanCommand.Type;
export const loanActions = (
  loan: LoanRecord,
  role: Role,
  unresolvedCoreOperation: boolean,
): readonly LoanCommand["action"][] => {
  if (unresolvedCoreOperation) return [];
  if (
    loan.status === "submitted" &&
    !loan.maker &&
    !loan.checker &&
    !loan.core_id &&
    !loan.withdrawal_requested
  )
    return role === "customer"
      ? ["cancel"]
      : role === "officer"
        ? ["recommend", "reject"]
        : [];
  if (
    loan.status === "recommended" &&
    loan.maker === "officer" &&
    !loan.checker &&
    !loan.core_id &&
    !loan.withdrawal_requested
  )
    return role === "approver"
      ? ["register", "reject"]
      : role === "customer"
        ? ["cancel"]
        : [];
  if (loan.maker !== "officer" || loan.checker !== "approver" || !loan.core_id)
    return [];
  if (loan.status !== "registered" && loan.status !== "approved") return [];
  if (loan.withdrawal_requested)
    return role === "approver"
      ? loan.status === "approved"
        ? ["undo_approval"]
        : ["withdraw"]
      : [];
  if (role === "customer") return ["request_withdrawal"];
  if (role !== "approver") return [];
  return loan.status === "registered"
    ? ["approve"]
    : loan.status === "approved"
      ? ["disburse"]
      : [];
};

// A proposed transition is persisted only after any required core effect is verified.
export const loanDecision = (
  loan: LoanRecord,
  command: LoanCommand,
  role: Role,
  unresolvedCoreOperation: boolean,
) =>
  Effect.gen(function* () {
    if (command.id !== loan.id || command.version !== loan.version)
      return yield* fail(
        "The loan application changed. Refresh and review it again.",
      );
    if (command.note.trim().length < 5 || command.note.length > 300)
      return yield* fail(
        "Give a loan instruction reason of 5–300 characters.",
        400,
      );
    if (
      !loanActions(loan, role, unresolvedCoreOperation).includes(command.action)
    )
      return yield* fail(
        "This loan action is unavailable. Inspect any unresolved core operation first.",
        403,
      );
    const next = {
      recommend: "recommended",
      register: "registered",
      approve: "approved",
      disburse: "active",
      reject: "rejected",
      cancel: "cancelled",
      request_withdrawal: loan.status,
      undo_approval: "registered",
      withdraw: "withdrawn",
    } as const;
    return {
      next_status: next[command.action],
      maker: command.action === "recommend" ? ("officer" as const) : loan.maker,
      checker:
        command.action === "register" ? ("approver" as const) : loan.checker,
      withdrawal_requested:
        command.action === "request_withdrawal" || loan.withdrawal_requested,
      core_command:
        command.action === "register" ||
        command.action === "approve" ||
        command.action === "disburse" ||
        command.action === "undo_approval" ||
        command.action === "withdraw"
          ? command.action
          : null,
      note: command.note.trim(),
    };
  });
