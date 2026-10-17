import { Clock, Effect, Schema } from "effect";
import { BankingError, type Session } from "../domain/banking";
import { planningHouseholds } from "../domain/planning-fixtures";
import {
  initialPlanningState,
  PlanningState as StateSchema,
  transitionPlanningState,
  validatePlanningState,
} from "../domain/planning-state";
import { Store } from "../domain/ports";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const decode = (raw: string, household: string) =>
  Schema.decodeUnknown(Schema.parseJson(StateSchema), {
    onExcessProperty: "error",
  })(raw).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Saved planning data could not be verified. Preserve this record for inspection.",
          status: 503,
        }),
    ),
    Effect.flatMap((state) => validatePlanningState(state, household)),
  );
const householdExists = (id: string) =>
  planningHouseholds().some((h) => h.id === id);
const requireOwner = (session: Session) =>
  session.role === "customer"
    ? Effect.void
    : fail(
        "Only the household customer can change planning records or consent.",
        403,
      );
export const readPlanning = (session: Session, household: string) =>
  Effect.gen(function* () {
    if (!householdExists(household))
      return yield* fail("Synthetic household not found.", 404);
    if (session.role === "approver")
      return yield* fail(
        "Banking approval does not grant household planning access.",
        403,
      );
    const store = yield* Store;
    const row = yield* store.one<{ state: string }>(
      "SELECT state FROM planning_households WHERE bank_id=? AND household_id=?",
      session.bank_id,
      household,
    );
    if (!row)
      return yield* fail(
        "This household has not been initialized for your relationship. Ask the customer to set it up deliberately.",
        404,
      );
    const state = yield* decode(row.state, household);
    if (session.role === "officer" && !state.adviserConsent)
      return yield* fail(
        "The customer has not consented to a planning review for this household.",
        403,
      );
    const history = yield* store.all<{
      id: string;
      action: string;
      actor: string;
      version: number;
      created_at: string;
    }>(
      "SELECT id,action,actor,version,created_at FROM planning_events WHERE bank_id=? AND household_id=? ORDER BY version DESC LIMIT 100",
      session.bank_id,
      household,
    );
    return {
      state,
      history,
      relationship: session.bank_id,
      readOnly: session.role !== "customer",
    };
  });
const commandReplay = (session: Session, key: string, payload: string) =>
  Effect.gen(function* () {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
      return yield* fail(
        "A stable planning command reference is required.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{
      household_id: string;
      payload: string;
      state: string;
      actor: string;
    }>(
      "SELECT household_id,payload,state,actor FROM planning_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    if (!event) return null;
    if (event.payload !== payload || event.actor !== session.role)
      return yield* fail(
        "This command reference belongs to different planning inputs.",
      );
    return yield* decode(event.state, event.household_id);
  });
export const inspectPlanningCommand = (
  session: Session,
  household: string,
  key: string,
) =>
  Effect.gen(function* () {
    yield* readPlanning(session, household);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
      return yield* fail(
        "A valid planning command reference is required.",
        400,
      );
    const store = yield* Store;
    const event = yield* store.one<{ state: string }>(
      "SELECT state FROM planning_events WHERE bank_id=? AND household_id=? AND command_key=?",
      session.bank_id,
      household,
      key,
    );
    if (!event)
      return yield* fail(
        "No planning command is recorded with this reference. Retain its original inputs before retrying.",
        404,
      );
    return {
      state: yield* decode(event.state, household),
      confirmedKey: key,
      relationship: session.bank_id,
    };
  });
export const initializePlanning = (
  session: Session,
  household: string,
  key: string,
) =>
  Effect.gen(function* () {
    yield* requireOwner(session);
    const h = planningHouseholds().find((item) => item.id === household);
    if (!h) return yield* fail("Synthetic household not found.", 404);
    const state = initialPlanningState(h);
    const payload = JSON.stringify({ action: "initialize", household });
    const replay = yield* commandReplay(session, key, payload);
    if (replay) return replay;
    const store = yield* Store;
    const exists = yield* store.one(
      "SELECT version FROM planning_households WHERE bank_id=? AND household_id=?",
      session.bank_id,
      household,
    );
    if (exists)
      return yield* fail(
        "This household already exists. Open it; setup never resets saved plans.",
      );
    yield* store.run(
      "INSERT INTO planning_events(id,bank_id,household_id,command_key,payload,actor,action,state,version,created_at) SELECT ?,?,?,?,?,'customer','initialize',?,0,? WHERE NOT EXISTS(SELECT 1 FROM planning_households WHERE bank_id=? AND household_id=?) ON CONFLICT DO NOTHING",
      crypto.randomUUID(),
      session.bank_id,
      household,
      key,
      payload,
      JSON.stringify(state),
      new Date(yield* Clock.currentTimeMillis).toISOString(),
      session.bank_id,
      household,
    );
    const saved = yield* commandReplay(session, key, payload);
    return (
      saved ??
      (yield* fail(
        "Household setup changed concurrently. Open the saved household before retrying.",
      ))
    );
  });
export const savePlanning = (
  session: Session,
  household: string,
  input: unknown,
  key: string,
) =>
  Effect.gen(function* () {
    yield* requireOwner(session);
    const proposed = yield* validatePlanningState(input, household);
    const payload = JSON.stringify({ action: "save", state: proposed });
    const replay = yield* commandReplay(session, key, payload);
    if (replay) return replay;
    const current = (yield* readPlanning(session, household)).state;
    const next = yield* transitionPlanningState(current, proposed);
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO planning_events(id,bank_id,household_id,command_key,payload,actor,action,state,version,created_at) SELECT ?,?,?,?,?,'customer','save',?,?,? FROM planning_households WHERE bank_id=? AND household_id=? AND version=? ON CONFLICT DO NOTHING",
      crypto.randomUUID(),
      session.bank_id,
      household,
      key,
      payload,
      JSON.stringify(next),
      next.version,
      new Date(yield* Clock.currentTimeMillis).toISOString(),
      session.bank_id,
      household,
      current.version,
    );
    const saved = yield* commandReplay(session, key, payload);
    return (
      saved ??
      (yield* fail(
        "Planning changed during this save. Reload the household before editing again.",
      ))
    );
  });
