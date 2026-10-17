import { Effect, Schema } from "effect";
import { BankingError, formatMoney } from "./banking";
import { type DepositDetail, maturityDate, maturityMinor } from "./deposits";
import {
  type RecurringDetail,
  recurringMaturityMinor,
} from "./recurring-deposits";

export const DepositAdviceQuery = Schema.Struct({
  kind: Schema.Literal("fixed", "recurring"),
  id: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  download: Schema.optional(Schema.Literal("1")),
});
export const DepositAdvice = Schema.Struct({
  kind: DepositAdviceQuery.fields.kind,
  product_id: Schema.NonEmptyString,
  bank_id: Schema.NonEmptyString,
  reference: Schema.String.pipe(Schema.pattern(/^(FD|RD)-[A-Z0-9-]{1,8}$/)),
  label: Schema.String,
  amount: Schema.Number.pipe(Schema.int(), Schema.positive()),
  months: Schema.Number.pipe(Schema.int(), Schema.positive()),
  annual_rate: Schema.Literal(6),
  planned_minor: Schema.Number.pipe(Schema.int(), Schema.positive()),
  maturity_minor: Schema.Number.pipe(Schema.int(), Schema.positive()),
  activated_at: Schema.String,
  maturity_date: Schema.String,
  activation_version: Schema.Literal(2),
  maker: Schema.Literal("officer"),
  checker: Schema.Literal("approver"),
  nominee: Schema.String,
  maturity_instruction: Schema.String,
});
export type DepositAdvice = typeof DepositAdvice.Type;
const adviceBoundary =
  "Synthetic opening advice only. No savings debit, mandate, credited interest, payout or external settlement. This is not an interest or tax certificate, or proof of actual funding.";

export const openingAdvice = (
  source:
    | { kind: "fixed"; detail: DepositDetail }
    | { kind: "recurring"; detail: RecurringDetail },
) =>
  Effect.gen(function* () {
    const plan =
      source.kind === "fixed" ? source.detail.deposit : source.detail.plan;
    const fail = (message: string, status: number) =>
      Effect.fail(new BankingError({ message, status }));
    if (plan.status !== "active")
      return yield* fail(
        "Opening advice is available only for an active holding.",
        409,
      );
    const activation = source.detail.history.filter(
      (event) => event.action === "activate",
    );
    const recommendation = source.detail.history.find(
      (event) => event.version === 1,
    );
    const expected =
      source.kind === "fixed"
        ? maturityMinor(source.detail.deposit.terms)
        : recurringMaturityMinor(source.detail.plan.terms);
    if (
      !plan.activated_at ||
      !Number.isFinite(Date.parse(plan.activated_at)) ||
      plan.maker !== "officer" ||
      plan.checker !== "approver" ||
      plan.version < 2 ||
      activation.length !== 1 ||
      activation[0]?.version !== 2 ||
      activation[0]?.actor !== "approver" ||
      activation[0]?.status !== "active" ||
      activation[0]?.created_at !== plan.activated_at ||
      recommendation?.action !== "recommend" ||
      recommendation.actor !== "officer" ||
      recommendation.status !== "recommended" ||
      plan.maturity_minor !== expected ||
      plan.maturity_date !== maturityDate(plan.activated_at, plan.terms.months)
    )
      return yield* fail(
        "Saved activation facts could not be verified. Ask the service desk to inspect the holding.",
        503,
      );
    const reference = `${source.kind === "fixed" ? "FD" : "RD"}-${plan.id.slice(0, 8).toUpperCase()}`;
    return yield* Schema.decodeUnknown(DepositAdvice)({
      kind: source.kind,
      product_id: plan.id,
      bank_id: plan.bank_id,
      reference,
      label:
        source.kind === "fixed"
          ? "Fixed deposit"
          : source.detail.plan.terms.label || "Recurring plan",
      amount: plan.terms.amount,
      months: plan.terms.months,
      annual_rate: 6,
      planned_minor:
        plan.terms.amount *
        100 *
        (source.kind === "fixed" ? 1 : plan.terms.months),
      maturity_minor: plan.maturity_minor,
      activated_at: plan.activated_at,
      maturity_date: plan.maturity_date,
      activation_version: 2,
      maker: plan.maker,
      checker: plan.checker,
      nominee: plan.terms.nominee
        ? `${plan.terms.nominee.name} · ${plan.terms.nominee.relationship}`
        : "No nominee selected",
      maturity_instruction:
        source.kind === "fixed"
          ? source.detail.deposit.terms.maturity === "return_all"
            ? "Return principal and illustrated interest (intent only)"
            : "Renew principal (intent only)"
          : `Planned monthly allocations; subsequent day ${source.detail.plan.terms.day}. Record each due installment explicitly.`,
    }).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "Opening advice could not be verified.",
            status: 503,
          }),
      ),
    );
  });

const adviceFacts = (
  advice: DepositAdvice,
): readonly (readonly [string, string])[] => [
  ["Holding reference", advice.reference],
  ["Product", advice.label],
  [
    advice.kind === "fixed" ? "Demo allocation" : "Monthly demo allocation",
    formatMoney(advice.amount),
  ],
  ["Term", `${advice.months} months`],
  ["Planned allocations", formatMoney(advice.planned_minor / 100)],
  [
    "Illustrated annual rate",
    `${advice.annual_rate}% simple interest${advice.kind === "recurring" ? " · month-prorated" : ""}`,
  ],
  ["Illustrated maturity amount", formatMoney(advice.maturity_minor / 100)],
  ["Activation date", advice.activated_at],
  ["Scheduled maturity date", advice.maturity_date],
  [
    "Authorization",
    `${advice.maker} → ${advice.checker} · activation version ${advice.activation_version}`,
  ],
  ["Adult nominee", advice.nominee],
  ["Recorded instruction", advice.maturity_instruction],
];
const line = (value: string) => value.replace(/\p{Cc}/gu, " ");
export const adviceText = (advice: DepositAdvice) =>
  [
    "OPENFINACLE — DEMO OPENING ADVICE",
    "",
    adviceBoundary,
    "",
    ...adviceFacts(advice).map(([label, value]) => `${label}: ${line(value)}`),
    "",
    "Original activation facts only. The illustration assumes the planned allocations; no accrued or credited earnings are certified. Current recurring installment progress is available in the holding view.",
    "",
  ].join("\r\n");
