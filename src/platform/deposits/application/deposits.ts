import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import {
  Deposit,
  type DepositCommand,
  DepositDetail,
  DepositEvent,
  type DepositTerms,
  depositActions,
  depositTransition,
  normalizeTerms,
} from "../domain/deposits";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Saved deposit data could not be verified. Ask the service desk to inspect this record.",
          status: 503,
        }),
    ),
  );
const columns =
  "id,bank_id,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,version,created_at,updated_at";
const decode = (row: unknown) =>
  parse(
    Schema.Struct({
      ...Deposit.fields,
      terms: Schema.parseJson(Deposit.fields.terms),
    }),
    row,
  );
const validKey = (key: string) => /^[a-zA-Z0-9_-]{8,100}$/.test(key);
export const listDeposits = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const rows = yield* store.all(
      `SELECT ${columns} FROM synthetic_deposits WHERE bank_id=? ORDER BY created_at DESC,id DESC`,
      session.bank_id,
    );
    return { deposits: yield* Effect.forEach(rows, decode) };
  });
export const depositDetail = (
  session: Session,
  id: string,
  confirmedKey: string | null = null,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one(
      `SELECT ${columns} FROM synthetic_deposits WHERE id=? AND bank_id=?`,
      id,
      session.bank_id,
    );
    if (!row) return yield* fail("Deposit not found.", 404);
    const deposit = yield* decode(row);
    const rows = yield* store.all(
      "SELECT id,actor,action,note,status,version,created_at FROM deposit_events WHERE deposit_id=? AND bank_id=? ORDER BY version",
      id,
      session.bank_id,
    );
    return yield* parse(DepositDetail, {
      deposit,
      history: yield* Effect.forEach(rows, (row) => parse(DepositEvent, row)),
      actions: depositActions(deposit, session.role),
      confirmed_key: confirmedKey,
    });
  });
export const depositForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    if (!validKey(key))
      return yield* fail("Choose a valid deposit command reference.", 400);
    const store = yield* Store;
    const event = yield* store.one<{ deposit_id: string }>(
      "SELECT deposit_id FROM deposit_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (!event)
      return yield* fail(
        "No deposit instruction is recorded with this reference. You may retry its original details.",
        404,
      );
    return yield* depositDetail(session, event.deposit_id, key);
  });
const replay = (session: Session, key: string, payload: string) =>
  Effect.gen(function* () {
    if (!validKey(key))
      return yield* fail(
        "A stable deposit command reference is required.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{
      deposit_id: string;
      command_payload: string;
      actor: string;
    }>(
      "SELECT deposit_id,command_payload,actor FROM deposit_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (
      event &&
      (event.command_payload !== payload || event.actor !== session.role)
    )
      return yield* fail(
        "This reference belongs to a different deposit instruction. Inspect its history.",
      );
    return event ? yield* depositDetail(session, event.deposit_id, key) : null;
  });
export const submitDeposit = (
  session: Session,
  input: DepositTerms,
  key: string,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail("Submit the deposit as the customer.", 403);
    const terms = yield* normalizeTerms(input);
    const payload = JSON.stringify({ action: "submit", terms });
    const saved = yield* replay(session, key, payload);
    if (saved) return saved;
    const store = yield* Store;
    const bank = yield* store.one<{ customer_account: number; status: string }>(
      "SELECT customer_account,status FROM banks WHERE id=?",
      session.bank_id,
    );
    if (!bank || bank.customer_account <= 0 || bank.status !== "ready")
      return yield* fail(
        "Open the relationship's account before submitting a deposit.",
      );
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    const id = crypto.randomUUID();
    yield* store.run(
      "INSERT INTO deposit_events(id,bank_id,deposit_id,command_key,command_payload,actor,action,note,terms,status,version,created_at) VALUES(?,?,?,?,?,?,'submit','Synthetic demo allocation; no savings debit or settlement.',?,'submitted',0,?) ON CONFLICT(bank_id,command_key) DO NOTHING",
      crypto.randomUUID(),
      session.bank_id,
      id,
      key,
      payload,
      session.role,
      JSON.stringify(terms),
      timestamp,
    );
    const result = yield* replay(session, key, payload);
    return (
      result ??
      (yield* fail(
        "Deposit submission could not be confirmed. Inspect its reference.",
        503,
      ))
    );
  });
export const actOnDeposit = (
  session: Session,
  input: DepositCommand,
  key: string,
) =>
  Effect.gen(function* () {
    const payload = JSON.stringify({
      action: input.action,
      id: input.id,
      version: input.version,
      note: input.note.trim(),
    });
    const saved = yield* replay(session, key, payload);
    if (saved) return saved;
    const { deposit } = yield* depositDetail(session, input.id);
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    const next = yield* depositTransition(
      deposit,
      session.role,
      input,
      timestamp,
    );
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO deposit_events(id,bank_id,deposit_id,command_key,command_payload,actor,action,note,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,version,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM synthetic_deposits WHERE id=? AND bank_id=? AND version=? ON CONFLICT(bank_id,command_key) DO NOTHING",
      crypto.randomUUID(),
      session.bank_id,
      input.id,
      key,
      payload,
      session.role,
      input.action,
      input.note.trim(),
      JSON.stringify(deposit.terms),
      next.status,
      next.maker,
      next.checker,
      next.activated_at,
      next.maturity_date,
      next.maturity_minor,
      input.version + 1,
      timestamp,
      input.id,
      session.bank_id,
      input.version,
    );
    const result = yield* replay(session, key, payload);
    return (
      result ??
      (yield* fail(
        "This deposit changed while you were reviewing. Refresh its history.",
      ))
    );
  });
