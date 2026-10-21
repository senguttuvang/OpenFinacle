import { Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Role,
} from "../../banking-workspace/domain/banking";

export const DepositTerms = Schema.Struct({
  product: Schema.Literal("demo-cumulative"),
  amount: Schema.Number.pipe(Schema.int(), Schema.between(1000, 1000000)),
  months: Schema.Literal(6, 12, 24),
  maturity: Schema.Literal("return_all", "renew_principal"),
  nominee: Schema.NullOr(
    Schema.Struct({
      name: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(80)),
      relationship: Schema.Literal(
        "spouse",
        "parent",
        "child",
        "sibling",
        "other",
      ),
    }),
  ),
});
export type DepositTerms = typeof DepositTerms.Type;
export const Deposit = Schema.Struct({
  id: Schema.String,
  bank_id: Schema.String,
  terms: DepositTerms,
  status: Schema.Literal(
    "submitted",
    "recommended",
    "active",
    "rejected",
    "cancelled",
  ),
  maker: Schema.NullOr(Schema.String),
  checker: Schema.NullOr(Schema.String),
  activated_at: Schema.NullOr(Schema.String),
  maturity_date: Schema.NullOr(Schema.String),
  maturity_minor: Schema.NullOr(Schema.Number.pipe(Schema.int())),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type Deposit = typeof Deposit.Type;
const actions = ["recommend", "activate", "reject", "cancel"] as const;
export const DepositCommand = Schema.Struct({
  id: Schema.NonEmptyString,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  action: Schema.Literal(...actions),
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
});
export type DepositCommand = typeof DepositCommand.Type;
export const DepositEvent = Schema.Struct({
  id: Schema.String,
  actor: Schema.String,
  action: Schema.String,
  note: Schema.String,
  status: Deposit.fields.status,
  version: Schema.Number,
  created_at: Schema.String,
});
export const DepositDetail = Schema.Struct({
  deposit: Deposit,
  history: Schema.Array(DepositEvent),
  actions: Schema.Array(Schema.Literal(...actions)),
  confirmed_key: Schema.NullOr(Schema.String),
});
export type DepositDetail = typeof DepositDetail.Type;
export const maturityMinor = (terms: DepositTerms) =>
  terms.amount * 100 +
  Math.round((terms.amount * 100 * 600 * terms.months) / 120000);
export const maturityDate = (instant: string, months: number) => {
  const date = new Date(`${bankingDate(Date.parse(instant))}T00:00:00Z`);
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months + 1, 0),
  );
  end.setUTCDate(Math.min(date.getUTCDate(), end.getUTCDate()));
  return end.toISOString().slice(0, 10);
};
export const normalizeTerms = (input: DepositTerms) =>
  Effect.gen(function* () {
    const terms = {
      product: input.product,
      amount: input.amount,
      months: input.months,
      maturity: input.maturity,
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
export const depositActions = (deposit: Deposit, role: Role) =>
  actions.filter((action) => {
    if (deposit.status === "submitted")
      return role === "customer"
        ? action === "cancel"
        : role === "officer" && (action === "recommend" || action === "reject");
    return (
      deposit.status === "recommended" &&
      role === "approver" &&
      deposit.maker !== role &&
      (action === "activate" || action === "reject")
    );
  });
export const depositTransition = (
  deposit: Deposit,
  role: Role,
  input: DepositCommand,
  timestamp: string,
) =>
  Effect.gen(function* () {
    if (deposit.version !== input.version)
      return yield* Effect.fail(
        new BankingError({
          message:
            "This deposit changed. Refresh its history before continuing.",
          status: 409,
        }),
      );
    if (!depositActions(deposit, role).includes(input.action))
      return yield* Effect.fail(
        new BankingError({
          message:
            "This deposit action is not permitted for your role or the current state.",
          status: 403,
        }),
      );
    if (input.note.trim().length < 5)
      return yield* Effect.fail(
        new BankingError({
          message: "Enter a reason of at least five characters.",
          status: 400,
        }),
      );
    return {
      status:
        input.action === "recommend"
          ? ("recommended" as const)
          : input.action === "activate"
            ? ("active" as const)
            : input.action === "reject"
              ? ("rejected" as const)
              : ("cancelled" as const),
      maker: input.action === "recommend" ? role : deposit.maker,
      checker: role === "approver" ? role : deposit.checker,
      activated_at: input.action === "activate" ? timestamp : null,
      maturity_date:
        input.action === "activate"
          ? maturityDate(timestamp, deposit.terms.months)
          : null,
      maturity_minor:
        input.action === "activate" ? maturityMinor(deposit.terms) : null,
    };
  });
