import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import {
  allowedCardActions,
  Card,
  type CardCommand,
  CardDetail,
  CardEvent,
  cardTransition,
} from "../domain/cards";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Saved card data could not be verified. Ask the service desk to inspect this record.",
          status: 503,
        }),
    ),
  );
const columns =
  "id,bank_id,suffix,status,json(settings) AS settings,version,updated_at,activation_required,replacement_id";
const decodeCard = (value: unknown) =>
  parse(
    Schema.Struct({
      ...Card.fields,
      settings: Schema.parseJson(Card.fields.settings),
      activation_required: Schema.Literal(0, 1),
    }),
    value,
  ).pipe(
    Effect.map((row) => ({
      ...row,
      activation_required: row.activation_required === 1,
    })),
  );
const keyValid = (key: string) => /^[a-zA-Z0-9_-]{8,100}$/.test(key);

export const listCards = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const rows = yield* store.all(
      `SELECT ${columns} FROM banking_cards WHERE bank_id=? ORDER BY updated_at DESC,id`,
      session.bank_id,
    );
    return { cards: yield* Effect.forEach(rows, decodeCard) };
  });

export const cardDetail = (
  session: Session,
  id: string,
  confirmedKey: string | null = null,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one(
      `SELECT ${columns} FROM banking_cards WHERE bank_id=? AND id=?`,
      session.bank_id,
      id,
    );
    if (!row) return yield* fail("Card not found.", 404);
    const card = yield* decodeCard(row);
    const rows = yield* store.all(
      "SELECT id,card_id,actor,action,note,status,settings,version,created_at FROM banking_card_events WHERE bank_id=? AND card_id=? ORDER BY version",
      session.bank_id,
      id,
    );
    const history = yield* Effect.forEach(rows, (row) =>
      parse(
        Schema.Struct({
          ...CardEvent.fields,
          settings: Schema.parseJson(CardEvent.fields.settings),
        }),
        row,
      ),
    );
    return yield* parse(CardDetail, {
      card,
      history,
      actions: allowedCardActions(card, session.role),
      confirmed_key: confirmedKey,
    });
  });

export const cardForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    if (!keyValid(key))
      return yield* fail("Choose a valid card command reference.", 400);
    const store = yield* Store;
    const event = yield* store.one<{ card_id: string }>(
      "SELECT card_id FROM banking_card_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (!event)
      return yield* fail(
        "No card change is recorded with this command reference. You may retry its original details.",
        404,
      );
    return yield* cardDetail(session, event.card_id, key);
  });

export const changeCard = (session: Session, input: CardCommand, key: string) =>
  Effect.gen(function* () {
    if (!keyValid(key))
      return yield* fail("A stable card command reference is required.", 400);
    const store = yield* Store;
    // Explicit canonical order prevents JSON field order from changing replay identity.
    const settings = input.settings;
    const payload = JSON.stringify({
      id: input.id,
      version: input.version,
      action: input.action,
      note: input.note.trim(),
      settings: settings
        ? {
            atm: settings.atm,
            pos: settings.pos,
            online: settings.online,
            contactless: settings.contactless,
            international: settings.international,
            daily_limit: settings.daily_limit,
          }
        : null,
    });
    const existing = yield* store.one<{
      card_id: string;
      command_payload: string;
      actor: string;
    }>(
      "SELECT card_id,command_payload,actor FROM banking_card_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (existing) {
      if (
        existing.command_payload !== payload ||
        existing.actor !== session.role
      )
        return yield* fail(
          "This command reference belongs to a different card instruction. Inspect its history.",
        );
      return yield* cardDetail(session, existing.card_id, key);
    }
    const { card } = yield* cardDetail(session, input.id);
    const next = yield* cardTransition(card, session.role, input);
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    const table = card.replacement_id
      ? "replacement_card_events"
      : "card_events";
    const source = card.replacement_id
      ? "replacement_cards"
      : "synthetic_cards";
    const inserted = yield* store.run(
      `INSERT INTO ${table}(id,bank_id,card_id,command_key,command_payload,actor,action,note,status,settings,version,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? FROM ${source} WHERE id=? AND bank_id=? AND version=? ON CONFLICT(bank_id,command_key) DO NOTHING`,
      crypto.randomUUID(),
      session.bank_id,
      input.id,
      key,
      payload,
      session.role,
      input.action,
      input.note.trim(),
      next.status,
      JSON.stringify(next.settings),
      input.version + 1,
      timestamp,
      input.id,
      session.bank_id,
      input.version,
    );
    if (!inserted) {
      const raced = yield* store.one<{
        command_payload: string;
        actor: string;
      }>(
        "SELECT command_payload,actor FROM banking_card_events WHERE bank_id=? AND command_key=?",
        session.bank_id,
        key,
      );
      if (raced?.command_payload !== payload || raced.actor !== session.role)
        return yield* fail(
          "This card changed while you were reviewing. Refresh its history before continuing.",
        );
    }
    return yield* cardDetail(session, input.id, key);
  });
