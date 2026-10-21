import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import {
  installmentState,
  normalizeRecurringTerms,
  type RecurringCommand,
  RecurringDetail,
  RecurringPlan,
  type RecurringTerms,
  recurringActions,
  recurringTransition,
} from "../domain/recurring-deposits";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Saved recurring-plan data could not be verified. Ask the service desk to inspect this record.",
          status: 503,
        }),
    ),
  );
const columns =
  "id,bank_id,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,allocated_count,allocated_minor,version,created_at,updated_at";
const decode = (row: unknown) =>
  parse(
    Schema.Struct({
      ...RecurringPlan.fields,
      terms: Schema.parseJson(RecurringPlan.fields.terms),
    }),
    row,
  );
const keyValid = (key: string) => /^[a-zA-Z0-9_-]{8,100}$/.test(key);
export const listRecurringPlans = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const rows = yield* store.all(
      `SELECT ${columns} FROM recurring_plans WHERE bank_id=? ORDER BY created_at DESC,id DESC`,
      session.bank_id,
    );
    return { plans: yield* Effect.forEach(rows, decode) };
  });
export const recurringDetail = (
  session: Session,
  id: string,
  confirmedKey: string | null = null,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one(
      `SELECT ${columns} FROM recurring_plans WHERE id=? AND bank_id=?`,
      id,
      session.bank_id,
    );
    if (!row) return yield* fail("Recurring plan not found.", 404);
    const plan = yield* decode(row);
    const today = bankingDate(yield* Clock.currentTimeMillis);
    const rows = yield* store.all<{
      period: number;
      due_date: string;
      amount_minor: number;
      allocated_at: string | null;
    }>(
      "SELECT period,due_date,amount_minor,allocated_at FROM recurring_installments WHERE plan_id=? ORDER BY period",
      id,
    );
    const installments = rows.map((item) => ({
      ...item,
      state: installmentState(item.due_date, item.allocated_at, today),
    }));
    const history = yield* store.all(
      "SELECT id,actor,action,note,status,period,version,created_at FROM recurring_events WHERE bank_id=? AND plan_id=? ORDER BY version",
      session.bank_id,
      id,
    );
    return yield* parse(RecurringDetail, {
      plan,
      installments,
      history,
      actions: recurringActions(plan, installments, session.role),
      confirmed_key: confirmedKey,
    });
  });
export const recurringForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    if (!keyValid(key))
      return yield* fail(
        "Choose a valid recurring-plan command reference.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{ plan_id: string }>(
      "SELECT plan_id FROM recurring_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (!event)
      return yield* fail(
        "No recurring instruction is recorded with this reference. You may retry its original details.",
        404,
      );
    return yield* recurringDetail(session, event.plan_id, key);
  });
const replay = (session: Session, key: string, payload: string) =>
  Effect.gen(function* () {
    if (!keyValid(key))
      return yield* fail(
        "A stable recurring-plan command reference is required.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{
      plan_id: string;
      command_payload: string;
      actor: string;
    }>(
      "SELECT plan_id,command_payload,actor FROM recurring_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (
      event &&
      (event.command_payload !== payload || event.actor !== session.role)
    )
      return yield* fail(
        "This reference belongs to a different recurring instruction. Inspect its history.",
      );
    return event ? yield* recurringDetail(session, event.plan_id, key) : null;
  });
export const submitRecurringPlan = (
  session: Session,
  input: RecurringTerms,
  key: string,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail("Submit the recurring plan as the customer.", 403);
    const terms = yield* normalizeRecurringTerms(input);
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
        "Open the relationship's account before submitting a recurring plan.",
      );
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    yield* store.run(
      "INSERT INTO recurring_events(id,bank_id,plan_id,command_key,command_payload,actor,action,note,terms,status,version,created_at) VALUES(?,?,?,?,?,?,'submit','Synthetic recurring plan; no savings mandate or debit.',?,'submitted',0,?) ON CONFLICT(bank_id,command_key) DO NOTHING",
      crypto.randomUUID(),
      session.bank_id,
      crypto.randomUUID(),
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
        "Recurring submission could not be confirmed. Inspect its reference.",
        503,
      ))
    );
  });
export const actOnRecurringPlan = (
  session: Session,
  input: RecurringCommand,
  key: string,
) =>
  Effect.gen(function* () {
    const payload = JSON.stringify({
      action: input.action,
      id: input.id,
      version: input.version,
      note: input.note.trim(),
      period: input.period ?? null,
    });
    const saved = yield* replay(session, key, payload);
    if (saved) return saved;
    const current = yield* recurringDetail(session, input.id);
    const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
    const next = yield* recurringTransition(
      current,
      session.role,
      input,
      timestamp,
    );
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO recurring_events(id,bank_id,plan_id,command_key,command_payload,actor,action,note,terms,status,maker,checker,activated_at,maturity_date,maturity_minor,period,schedule,version,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM recurring_plans WHERE id=? AND bank_id=? AND version=? ON CONFLICT(bank_id,command_key) DO NOTHING",
      crypto.randomUUID(),
      session.bank_id,
      input.id,
      key,
      payload,
      session.role,
      input.action,
      input.note.trim(),
      JSON.stringify(current.plan.terms),
      next.status,
      next.maker,
      next.checker,
      next.activated_at,
      next.maturity_date,
      next.maturity_minor,
      input.period ?? null,
      next.schedule ? JSON.stringify(next.schedule) : null,
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
        "This recurring plan changed while you were reviewing. Refresh its history.",
      ))
    );
  });
