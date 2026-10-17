import { Effect, Schema } from "effect";
import { BankingError, bankingDate, type Role } from "./banking";
import { Deposit, DepositTerms, maturityDate } from "./deposits";

export const RecurringTerms = Schema.Struct({
  product: Schema.Literal("demo-recurring"),
  amount: Schema.Number.pipe(
    Schema.int(),
    Schema.between(500, 100000),
    Schema.filter((value) => value % 100 === 0),
  ),
  months: Schema.Number.pipe(
    Schema.int(),
    Schema.between(6, 120),
    Schema.filter((value) => value % 3 === 0),
  ),
  day: Schema.Number.pipe(Schema.int(), Schema.between(1, 28)),
  label: Schema.String.pipe(Schema.maxLength(80)),
  nominee: DepositTerms.fields.nominee,
});
export type RecurringTerms = typeof RecurringTerms.Type;
export const RecurringPlan = Schema.Struct({
  id: Schema.String,
  bank_id: Schema.String,
  terms: RecurringTerms,
  status: Deposit.fields.status,
  maker: Schema.NullOr(Schema.String),
  checker: Schema.NullOr(Schema.String),
  activated_at: Schema.NullOr(Schema.String),
  maturity_date: Schema.NullOr(Schema.String),
  maturity_minor: Schema.NullOr(Schema.Number.pipe(Schema.int())),
  allocated_count: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  allocated_minor: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type RecurringPlan = typeof RecurringPlan.Type;
export const RecurringInstallment = Schema.Struct({
  period: Schema.Number.pipe(Schema.int(), Schema.positive()),
  due_date: Schema.String,
  amount_minor: Schema.Number.pipe(Schema.int(), Schema.positive()),
  allocated_at: Schema.NullOr(Schema.String),
  state: Schema.Literal("upcoming", "due", "missed", "allocated"),
});
export type RecurringInstallment = typeof RecurringInstallment.Type;
const actions = [
  "recommend",
  "activate",
  "reject",
  "cancel",
  "allocate",
] as const;
export const RecurringCommand = Schema.Struct({
  id: Schema.NonEmptyString,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  action: Schema.Literal(...actions),
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
  period: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(1, 120)),
  ),
});
export type RecurringCommand = typeof RecurringCommand.Type;
const RecurringEvent = Schema.Struct({
  id: Schema.String,
  actor: Schema.String,
  action: Schema.String,
  note: Schema.String,
  status: RecurringPlan.fields.status,
  period: Schema.NullOr(Schema.Number),
  version: Schema.Number,
  created_at: Schema.String,
});
export const RecurringDetail = Schema.Struct({
  plan: RecurringPlan,
  installments: Schema.Array(RecurringInstallment),
  history: Schema.Array(RecurringEvent),
  actions: Schema.Array(Schema.Literal(...actions)),
  confirmed_key: Schema.NullOr(Schema.String),
});
export type RecurringDetail = typeof RecurringDetail.Type;
export const recurringMaturityMinor = (terms: RecurringTerms) =>
  terms.amount * 100 * terms.months +
  Math.round(
    (terms.amount * 100 * 600 * terms.months * (terms.months + 1)) / 240000,
  );
export const recurringSchedule = (terms: RecurringTerms, instant: string) =>
  Array.from({ length: terms.months }, (_, index) => ({
    period: index + 1,
    due_date:
      index === 0
        ? bankingDate(Date.parse(instant))
        : `${maturityDate(instant, index).slice(0, 8)}${String(terms.day).padStart(2, "0")}`,
    amount_minor: terms.amount * 100,
  }));
export const installmentState = (
  dueDate: string,
  allocatedAt: string | null,
  today: string,
): RecurringInstallment["state"] =>
  allocatedAt
    ? "allocated"
    : dueDate > today
      ? "upcoming"
      : dueDate === today
        ? "due"
        : "missed";
export const normalizeRecurringTerms = (input: RecurringTerms) =>
  Effect.gen(function* () {
    const terms = {
      product: input.product,
      amount: input.amount,
      months: input.months,
      day: input.day,
      label: input.label.trim(),
      nominee: input.nominee
        ? {
            name: input.nominee.name.trim(),
            relationship: input.nominee.relationship,
          }
        : null,
    };
    if (terms.nominee && terms.nominee.name.length < 2)
      return yield* Effect.fail(
        new BankingError({
          message:
            "Enter a nominee name of at least two characters, or select no nominee.",
          status: 400,
        }),
      );
    return terms;
  });
export const recurringActions = (
  plan: RecurringPlan,
  installments: readonly RecurringInstallment[],
  role: Role,
) =>
  actions.filter((action) => {
    if (plan.status === "submitted")
      return role === "customer"
        ? action === "cancel"
        : role === "officer" && (action === "recommend" || action === "reject");
    if (plan.status === "recommended")
      return (
        role === "approver" &&
        plan.maker === "officer" &&
        (action === "activate" || action === "reject")
      );
    return (
      plan.status === "active" &&
      role === "customer" &&
      action === "allocate" &&
      installments.some(
        (item) => item.state === "due" || item.state === "missed",
      )
    );
  });
export const recurringTransition = (
  detail: RecurringDetail,
  role: Role,
  input: RecurringCommand,
  timestamp: string,
) =>
  Effect.gen(function* () {
    const { plan, installments } = detail;
    const fail = (message: string, status = 400) =>
      Effect.fail(new BankingError({ message, status }));
    if (plan.version !== input.version)
      return yield* fail(
        "This recurring plan changed. Refresh its history before continuing.",
        409,
      );
    if (!recurringActions(plan, installments, role).includes(input.action))
      return yield* fail(
        "This recurring-plan action is not permitted for your role or current state.",
        403,
      );
    if (input.note.trim().length < 5)
      return yield* fail("Enter a reason of at least five characters.");
    if ((input.action === "allocate") !== (input.period !== undefined))
      return yield* fail(
        "Supply an installment period only for a demo allocation.",
      );
    if (input.action === "allocate") {
      const next = installments.find((item) => item.state !== "allocated");
      if (!next || next.period !== input.period || next.state === "upcoming")
        return yield* fail(
          "Record only the earliest due or missed demo installment.",
          409,
        );
    }
    return {
      status:
        input.action === "recommend"
          ? ("recommended" as const)
          : input.action === "activate" || input.action === "allocate"
            ? ("active" as const)
            : input.action === "reject"
              ? ("rejected" as const)
              : ("cancelled" as const),
      maker: input.action === "recommend" ? role : plan.maker,
      checker: role === "approver" ? role : plan.checker,
      activated_at: input.action === "activate" ? timestamp : plan.activated_at,
      maturity_date:
        input.action === "activate"
          ? maturityDate(timestamp, plan.terms.months)
          : plan.maturity_date,
      maturity_minor:
        input.action === "activate"
          ? recurringMaturityMinor(plan.terms)
          : plan.maturity_minor,
      schedule:
        input.action === "activate"
          ? recurringSchedule(plan.terms, timestamp)
          : null,
    };
  });
