import { Effect, Schema } from "effect";
import {
  BankingError,
  type Role,
} from "../../banking-workspace/domain/banking";

const CardSettings = Schema.Struct({
  atm: Schema.Boolean,
  pos: Schema.Boolean,
  online: Schema.Boolean,
  contactless: Schema.Boolean,
  international: Schema.Boolean,
  daily_limit: Schema.Number.pipe(Schema.int(), Schema.between(0, 100000)),
});
export const Card = Schema.Struct({
  id: Schema.String,
  bank_id: Schema.String,
  suffix: Schema.String,
  status: Schema.Literal("active", "held", "blocked"),
  settings: CardSettings,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  updated_at: Schema.String,
  activation_required: Schema.optional(Schema.Boolean),
  replacement_id: Schema.optional(Schema.NullOr(Schema.String)),
});
export type Card = typeof Card.Type;
const cardActions = ["settings", "hold", "resume", "block"] as const;
export const CardCommand = Schema.Struct({
  id: Schema.NonEmptyString,
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  action: Schema.Literal(...cardActions),
  note: Schema.String.pipe(Schema.minLength(5), Schema.maxLength(300)),
  settings: Schema.optional(CardSettings),
});
export type CardCommand = typeof CardCommand.Type;
export const CardEvent = Schema.Struct({
  id: Schema.String,
  card_id: Schema.String,
  actor: Schema.String,
  action: Schema.String,
  note: Schema.String,
  status: Card.fields.status,
  settings: CardSettings,
  version: Schema.Number,
  created_at: Schema.String,
});
export const CardDetail = Schema.Struct({
  card: Card,
  history: Schema.Array(CardEvent),
  actions: Schema.Array(Schema.Literal(...cardActions)),
  confirmed_key: Schema.NullOr(Schema.String),
});
export type CardDetail = typeof CardDetail.Type;
export const allowedCardActions = (card: Card, role: Role) =>
  cardActions.filter((action) => {
    if (card.status === "blocked" || role === "approver") return false;
    if (action === "block") return true;
    if (card.activation_required) return false;
    if (role !== "customer") return false;
    return action === "resume"
      ? card.status === "held"
      : card.status === "active";
  });
export const cardTransition = (card: Card, role: Role, input: CardCommand) =>
  Effect.gen(function* () {
    const fail = (message: string, status = 400) =>
      Effect.fail(new BankingError({ message, status }));
    if (!allowedCardActions(card, role).includes(input.action))
      return yield* fail(
        "This card action is not permitted for your role or the current card state.",
        403,
      );
    if (card.version !== input.version)
      return yield* fail(
        "This card changed. Refresh its history before continuing.",
        409,
      );
    if (input.note.trim().length < 5)
      return yield* fail("Enter a reason of at least five characters.");
    if ((input.action === "settings") !== (input.settings !== undefined))
      return yield* fail("Supply settings only for a card settings change.");
    return {
      status:
        input.action === "hold"
          ? ("held" as const)
          : input.action === "block"
            ? ("blocked" as const)
            : ("active" as const),
      settings: input.settings ?? card.settings,
    };
  });
