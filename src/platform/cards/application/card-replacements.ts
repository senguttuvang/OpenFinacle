import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store, type StoreService } from "../../banking-workspace/domain/ports";
import {
  Replacement,
  type ReplacementCommand,
  ReplacementDetail,
  ReplacementEvent,
  type ReplacementTerms,
  replacementActions,
  replacementTerms,
  replacementTransition,
} from "../domain/card-replacements";
import { cardDetail } from "./cards";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Saved replacement data could not be verified. Ask the service desk to inspect this record.",
          status: 503,
        }),
    ),
  );
const columns =
  "id,bank_id,terms,status,maker,checker,card_id,version,created_at,updated_at";
const decode = (value: unknown) =>
  parse(
    Schema.Struct({
      ...Replacement.fields,
      terms: Schema.parseJson(Replacement.fields.terms),
    }),
    value,
  );
const keyValid = (key: string) => /^[a-zA-Z0-9_-]{8,100}$/.test(key);

export const listCardReplacements = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const rows = yield* store.all(
      `SELECT ${columns} FROM card_replacements WHERE bank_id=? ORDER BY created_at DESC,id DESC`,
      session.bank_id,
    );
    return { replacements: yield* Effect.forEach(rows, decode) };
  });
export const cardReplacementDetail = (
  session: Session,
  id: string,
  confirmedKey: string | null = null,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one(
      `SELECT ${columns} FROM card_replacements WHERE id=? AND bank_id=?`,
      id,
      session.bank_id,
    );
    if (!row) return yield* fail("Replacement not found.", 404);
    const replacement = yield* decode(row);
    const source = (yield* cardDetail(
      session,
      replacement.terms.source_card_id,
    )).card;
    const card = replacement.card_id
      ? (yield* cardDetail(session, replacement.card_id)).card
      : null;
    const rows = yield* store.all(
      "SELECT id,actor,action,note,status,version,created_at FROM card_replacement_events WHERE replacement_id=? AND bank_id=? ORDER BY version",
      id,
      session.bank_id,
    );
    return yield* parse(ReplacementDetail, {
      replacement,
      source,
      card,
      history: yield* Effect.forEach(rows, (row) =>
        parse(ReplacementEvent, row),
      ),
      actions: replacementActions(replacement, card, session.role),
      confirmed_key: confirmedKey,
    });
  });
export const cardReplacementForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    if (!keyValid(key))
      return yield* fail(
        "Choose a valid replacement instruction reference.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{ replacement_id: string }>(
      "SELECT replacement_id FROM card_replacement_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (!event)
      return yield* fail(
        "No replacement instruction is recorded with this reference. You may retry its original details.",
        404,
      );
    return yield* cardReplacementDetail(session, event.replacement_id, key);
  });
const replay = (session: Session, key: string, payload: string) =>
  Effect.gen(function* () {
    if (!keyValid(key))
      return yield* fail(
        "A stable replacement instruction reference is required.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{
      replacement_id: string;
      actor: string;
      command_payload: string;
    }>(
      "SELECT replacement_id,actor,command_payload FROM card_replacement_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (
      event &&
      (event.actor !== session.role || event.command_payload !== payload)
    )
      return yield* fail(
        "This reference belongs to a different replacement instruction. Inspect its history.",
      );
    return event
      ? yield* cardReplacementDetail(session, event.replacement_id, key)
      : null;
  });
// Reconcile a failed/stale insert by reading its key; never resend the instruction.
const persist = (
  session: Session,
  key: string,
  payload: string,
  write: Effect.Effect<number, BankingError, StoreService>,
) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.either(write);
    const saved = yield* replay(session, key, payload);
    if (saved) return saved;
    if (outcome._tag === "Left") return yield* Effect.fail(outcome.left);
    return yield* fail(
      "This replacement changed while you were reviewing. Refresh its history.",
    );
  });
export const submitCardReplacement = (
  session: Session,
  input: ReplacementTerms,
  key: string,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail("Submit the replacement as the customer.", 403);
    const canonical = {
      source_card_id: input.source_card_id,
      source_version: input.source_version,
      reason: input.reason,
      address: input.address.trim(),
    };
    const payload = JSON.stringify({ action: "submit", terms: canonical });
    const saved = yield* replay(session, key, payload);
    if (saved) return saved;
    const source = (yield* cardDetail(session, canonical.source_card_id)).card;
    const terms = yield* replacementTerms(canonical, source, session.role);
    const store = yield* Store;
    const bank = yield* store.one<{ customer_account: number; status: string }>(
      "SELECT customer_account,status FROM banks WHERE id=?",
      session.bank_id,
    );
    if (!bank || bank.customer_account <= 0 || bank.status !== "ready")
      return yield* fail(
        "Open the relationship account before requesting replacement.",
      );
    const existing = yield* store.one(
      "SELECT id FROM card_replacements WHERE bank_id=? AND json_extract(terms,'$.source_card_id')=? AND (card_id IS NOT NULL OR status IN ('submitted','recommended'))",
      session.bank_id,
      source.id,
    );
    if (existing)
      return yield* fail(
        "This instrument already has a replacement request or successor. Inspect the saved request and current card.",
      );
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    return yield* persist(
      session,
      key,
      payload,
      store.run(
        "INSERT INTO card_replacement_events(id,bank_id,replacement_id,command_key,command_payload,actor,action,note,terms,status,version,created_at) VALUES(?,?,?,?,?,?,'submit','Synthetic replacement; no courier, credentials, fee or network effect.',?,'submitted',0,?) ON CONFLICT(bank_id,command_key) DO NOTHING",
        crypto.randomUUID(),
        session.bank_id,
        crypto.randomUUID(),
        key,
        payload,
        session.role,
        JSON.stringify(terms),
        timestamp,
      ),
    );
  });
export const actOnCardReplacement = (
  session: Session,
  input: ReplacementCommand,
  key: string,
) =>
  Effect.gen(function* () {
    const payload = JSON.stringify({
      id: input.id,
      version: input.version,
      action: input.action,
      note: input.note.trim(),
      source_version: input.source_version ?? null,
      card_version: input.card_version ?? null,
    });
    const saved = yield* replay(session, key, payload);
    if (saved) return saved;
    const detail = yield* cardReplacementDetail(session, input.id);
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    const next = yield* replacementTransition(
      detail,
      session.role,
      input,
      timestamp,
    );
    const store = yield* Store;
    return yield* persist(
      session,
      key,
      payload,
      store.run(
        "INSERT INTO card_replacement_events(id,bank_id,replacement_id,command_key,command_payload,actor,action,note,terms,status,maker,checker,card_id,source_version,card_version,card,version,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM card_replacements WHERE id=? AND bank_id=? AND version=? ON CONFLICT(bank_id,command_key) DO NOTHING",
        crypto.randomUUID(),
        session.bank_id,
        input.id,
        key,
        payload,
        session.role,
        input.action,
        input.note.trim(),
        JSON.stringify(detail.replacement.terms),
        next.status,
        next.maker,
        next.checker,
        next.card_id,
        input.source_version ?? null,
        input.card_version ?? null,
        next.card ? JSON.stringify(next.card) : null,
        input.version + 1,
        timestamp,
        input.id,
        session.bank_id,
        input.version,
      ),
    );
  });
