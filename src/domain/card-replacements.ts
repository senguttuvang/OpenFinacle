import { Effect, Schema } from "effect";
import { BankingError, type Role } from "./banking";
import { Card } from "./cards";

export const ReplacementTerms = Schema.Struct({
  source_card_id: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(100),
  ),
  source_version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  reason: Schema.Literal("damaged", "expired", "lost"),
  address: Schema.String.pipe(Schema.minLength(10), Schema.maxLength(300)),
});
export type ReplacementTerms = typeof ReplacementTerms.Type;
export const Replacement = Schema.Struct({
  id: Schema.NonEmptyString,
  bank_id: Schema.NonEmptyString,
  terms: ReplacementTerms,
  status: Schema.Literal(
    "submitted",
    "recommended",
    "issued",
    "dispatched",
    "delivered",
    "activated",
    "rejected",
    "cancelled",
  ),
  maker: Schema.NullOr(Schema.String),
  checker: Schema.NullOr(Schema.String),
  card_id: Schema.NullOr(Schema.String),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type Replacement = typeof Replacement.Type;
const actions = [
  "recommend",
  "issue",
  "dispatch",
  "deliver",
  "activate",
  "reject",
  "cancel",
] as const;
export const ReplacementCommand = Schema.Struct({
  id: Schema.NonEmptyString,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  action: Schema.Literal(...actions),
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
  source_version: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  ),
  card_version: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  ),
});
export type ReplacementCommand = typeof ReplacementCommand.Type;
export const ReplacementEvent = Schema.Struct({
  id: Schema.String,
  actor: Schema.String,
  action: Schema.String,
  note: Schema.String,
  status: Replacement.fields.status,
  version: Schema.Number,
  created_at: Schema.String,
});
export const ReplacementDetail = Schema.Struct({
  replacement: Replacement,
  source: Card,
  card: Schema.NullOr(Card),
  history: Schema.Array(ReplacementEvent),
  actions: Schema.Array(Schema.Literal(...actions)),
  confirmed_key: Schema.NullOr(Schema.String),
});
export type ReplacementDetail = typeof ReplacementDetail.Type;
const fail = (message: string, status = 400) =>
  Effect.fail(new BankingError({ message, status }));

export const replacementTerms = (
  input: ReplacementTerms,
  source: Card,
  role: Role,
) =>
  Effect.gen(function* () {
    if (role !== "customer")
      return yield* fail("Submit the replacement as the customer.", 403);
    if (input.source_card_id !== source.id)
      return yield* fail("Choose the owned source card.", 404);
    if (input.source_version !== source.version)
      return yield* fail(
        "The source card changed. Review its current state first.",
        409,
      );
    if (input.reason === "lost" && source.status !== "blocked")
      return yield* fail(
        "Permanently block the lost card before requesting its replacement.",
        409,
      );
    const terms = { ...input, address: input.address.trim() };
    if (terms.address.length < 10)
      return yield* fail(
        "Confirm an invented delivery address of at least ten characters.",
      );
    return terms;
  });

export const replacementActions = (
  request: Replacement,
  card: Card | null,
  role: Role,
) =>
  actions.filter((action) => {
    if (request.status === "submitted")
      return role === "customer"
        ? action === "cancel"
        : role === "officer" && (action === "recommend" || action === "reject");
    if (request.status === "recommended")
      return (
        role === "approver" &&
        request.maker === "officer" &&
        (action === "issue" || action === "reject")
      );
    if (request.status === "issued")
      return role === "officer" && action === "dispatch";
    if (request.status === "dispatched")
      return role === "officer" && action === "deliver";
    return (
      request.status === "delivered" &&
      card?.status === "held" &&
      role === "customer" &&
      action === "activate"
    );
  });
export const replacementCard = (
  request: Replacement,
  timestamp: string,
): Card => ({
  id: `replacement:${request.id}`,
  bank_id: request.bank_id,
  suffix: `R-${request.id.slice(0, 6).toUpperCase()}`,
  status: "held",
  version: 0,
  updated_at: timestamp,
  activation_required: true,
  replacement_id: request.id,
  settings: {
    atm: false,
    pos: false,
    online: false,
    contactless: false,
    international: false,
    daily_limit: 25000,
  },
});

export const replacementTransition = (
  detail: ReplacementDetail,
  role: Role,
  input: ReplacementCommand,
  timestamp: string,
) =>
  Effect.gen(function* () {
    const { replacement: request, source, card } = detail;
    if (request.version !== input.version)
      return yield* fail(
        "This replacement changed. Refresh its history before continuing.",
        409,
      );
    if (input.id !== request.id)
      return yield* fail("Replacement not found.", 404);
    if (!replacementActions(request, card, role).includes(input.action))
      return yield* fail(
        "This replacement action is not permitted for your role or current state.",
        403,
      );
    if (input.note.trim().length < 5)
      return yield* fail("Enter a reason of at least five characters.");
    if (
      (input.action === "issue") !== (input.source_version !== undefined) ||
      (input.action === "activate") !== (input.card_version !== undefined)
    )
      return yield* fail(
        "Supply the reviewed source version only for issuance and replacement-card version only for activation.",
      );
    if (input.action === "issue" && input.source_version !== source.version)
      return yield* fail(
        "The source card changed during review. Inspect it again before issuance.",
        409,
      );
    if (input.action === "activate" && input.card_version !== card?.version)
      return yield* fail(
        "The replacement card changed during review. Inspect it again before activation.",
        409,
      );
    if (
      source.bank_id !== request.bank_id ||
      source.id !== request.terms.source_card_id ||
      (card &&
        (card.bank_id !== request.bank_id || card.id !== request.card_id))
    )
      return yield* fail(
        "Replacement relationships could not be verified.",
        503,
      );
    if (
      (["issued", "dispatched", "delivered", "activated"].includes(
        request.status,
      ) &&
        (request.maker !== "officer" ||
          request.checker !== "approver" ||
          !card ||
          card.id !== `replacement:${request.id}`)) ||
      (input.action === "issue" && (card !== null || request.card_id !== null))
    )
      return yield* fail(
        "Saved independent issuance could not be verified.",
        503,
      );
    const status =
      input.action === "recommend"
        ? ("recommended" as const)
        : input.action === "issue"
          ? ("issued" as const)
          : input.action === "dispatch"
            ? ("dispatched" as const)
            : input.action === "deliver"
              ? ("delivered" as const)
              : input.action === "activate"
                ? ("activated" as const)
                : input.action === "reject"
                  ? ("rejected" as const)
                  : ("cancelled" as const);
    return {
      status,
      maker: input.action === "recommend" ? role : request.maker,
      checker:
        input.action === "issue" ||
        (input.action === "reject" && role === "approver")
          ? role
          : request.checker,
      card_id:
        input.action === "issue"
          ? `replacement:${request.id}`
          : request.card_id,
      card:
        input.action === "issue"
          ? replacementCard(request, timestamp)
          : input.action === "activate" && card
            ? {
                ...card,
                status: "active" as const,
                activation_required: false,
                version: card.version + 1,
                updated_at: timestamp,
              }
            : null,
      block_source: input.action === "issue" && source.status !== "blocked",
    };
  });
