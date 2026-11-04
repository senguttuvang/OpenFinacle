import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../../banking-workspace/domain/banking";
import { Store } from "../../../banking-workspace/domain/ports";
import {
  ResponsibilityCommand,
  ResponsibilityDetail,
  ResponsibilityEvent,
  ResponsibilityKey,
} from "../../domain/service-work/responsibility";
import { branchCustomer } from "../branch-day";

const fail = (message: string, status = 409, uncertain = false) =>
  Effect.fail(new BankingError({ message, status, uncertain }));
const columns =
  "id,branch_id AS branchId,customer_id AS customerId,request_id AS requestId,command_key AS key,actor,owner,note,expected_version AS expectedVersion,version,created_at AS createdAt,request_json AS requestJson";
const parse = <A, I>(schema: Schema.Schema<A, I>, raw: unknown) =>
  Schema.decodeUnknown(schema)(raw).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message: "Saved responsibility evidence is unavailable or invalid.",
          status: 503,
        }),
    ),
  );
const canonical = (
  actor: string,
  customerId: string,
  requestId: string,
  command: ResponsibilityCommand,
) =>
  JSON.stringify({
    actor,
    customerId,
    requestId,
    command: {
      version: command.version,
      owner: command.owner,
      note: command.note.trim(),
    },
  });
const event = (raw: unknown) =>
  Effect.gen(function* () {
    const value = yield* parse(ResponsibilityEvent, raw);
    if (
      typeof raw !== "object" ||
      !raw ||
      !("requestJson" in raw) ||
      raw.requestJson !==
        canonical(value.actor, value.customerId, value.requestId, {
          version: value.expectedVersion,
          owner: value.owner,
          note: value.note,
        })
    )
      return yield* fail("Saved assignment identity cannot be verified.", 503);
    return value;
  });
const scope = (session: Session, customerId: string, requestId: string) =>
  Effect.gen(function* () {
    const { branch, scoped } = yield* branchCustomer(session, customerId),
      store = yield* Store;
    if (
      !(yield* store.one(
        "SELECT id FROM service_requests WHERE id=? AND bank_id=?",
        requestId,
        scoped.bank_id,
      ))
    )
      return yield* fail(
        "Service case is outside this registered relationship.",
        404,
      );
    return { branch, customerId, requestId };
  });
type Scope = { branch: string; customerId: string; requestId: string };
const detail = (s: Scope, confirmedEvent: ResponsibilityEvent | null = null) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const latestRaw = yield* store.one(
      `SELECT ${columns} FROM branch_case_responsibility_events WHERE branch_id=? AND customer_id=? AND request_id=? ORDER BY version DESC LIMIT 1`,
      s.branch,
      s.customerId,
      s.requestId,
    );
    const rows = yield* store.all(
      `SELECT ${columns} FROM branch_case_responsibility_events WHERE branch_id=? AND customer_id=? AND request_id=? ORDER BY version LIMIT 201`,
      s.branch,
      s.customerId,
      s.requestId,
    );
    return yield* parse(ResponsibilityDetail, {
      source: "application_workflow",
      branchId: s.branch,
      customerId: s.customerId,
      requestId: s.requestId,
      observedAt: yield* Clock.currentTimeMillis,
      latest: latestRaw ? yield* event(latestRaw) : null,
      history: yield* Effect.forEach(rows.slice(0, 200), event),
      historyComplete: rows.length <= 200,
      confirmedEvent,
    });
  });
const keyEvent = (branch: string, key: string) =>
  Effect.gen(function* () {
    const store = yield* Store,
      row = yield* store.one(
        `SELECT ${columns} FROM branch_case_responsibility_events WHERE branch_id=? AND command_key=?`,
        branch,
        key,
      );
    return row ? yield* event(row) : null;
  });
export const readCaseResponsibility = (
  session: Session,
  customerId: string,
  requestId: string,
  key?: string,
) =>
  Effect.gen(function* () {
    const s = yield* scope(session, customerId, requestId);
    if (key === undefined) return yield* detail(s);
    if (!Schema.is(ResponsibilityKey)(key))
      return yield* fail(
        "Use the original responsibility request reference.",
        400,
      );
    const found = yield* keyEvent(s.branch, key);
    if (
      !found ||
      found.customerId !== customerId ||
      found.requestId !== requestId
    )
      return yield* fail(
        "No matching original assignment is recorded at this read. Retry only the original request and key.",
        404,
      );
    return yield* detail(s, found);
  });
export const assignCaseResponsibility = (
  session: Session,
  customerId: string,
  requestId: string,
  command: ResponsibilityCommand,
  key: string,
) =>
  Effect.gen(function* () {
    const s = yield* scope(session, customerId, requestId);
    if (!Schema.is(ResponsibilityKey)(key))
      return yield* fail(
        "Use a stable original responsibility reference.",
        400,
      );
    const input = yield* Schema.decodeUnknown(ResponsibilityCommand, {
      onExcessProperty: "error",
    })(command).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "Provide a valid responsibility, saved version and reason.",
            status: 400,
          }),
      ),
    );
    const normalized = { ...input, note: input.note.trim() };
    if (normalized.note.length < 5)
      return yield* fail(
        "Enter a responsibility reason of at least five characters.",
        400,
      );
    const requestJson = canonical(
      session.role,
      customerId,
      requestId,
      normalized,
    );
    const replay = () =>
      Effect.gen(function* () {
        const found = yield* keyEvent(s.branch, key);
        if (!found) return null;
        if (
          canonical(found.actor, found.customerId, found.requestId, {
            version: found.expectedVersion,
            owner: found.owner,
            note: found.note,
          }) !== requestJson
        )
          return yield* fail(
            "This original assignment reference belongs to different details or actor.",
          );
        return yield* detail(s, found);
      });
    const prior = yield* replay();
    if (prior) return prior;
    const current = yield* detail(s);
    if (!current.historyComplete)
      return yield* fail(
        "Assignment history is incomplete. Further changes are withheld.",
      );
    if ((current.latest?.version ?? 0) !== input.version)
      return yield* fail(
        "Responsibility changed. Refresh before assigning again.",
      );
    if ((current.latest?.owner ?? null) === input.owner)
      return yield* fail("Choose a different responsibility before saving.");
    const store = yield* Store,
      createdAt = new Date(yield* Clock.currentTimeMillis).toISOString();
    // The append and expected-version predicate execute atomically in the owning store.
    const outcome = yield* Effect.either(
      store.run(
        "INSERT INTO branch_case_responsibility_events(id,branch_id,customer_id,request_id,command_key,actor,owner,note,expected_version,version,request_json,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ?=COALESCE((SELECT max(version) FROM branch_case_responsibility_events WHERE request_id=?),0) ON CONFLICT(branch_id,command_key) DO NOTHING",
        crypto.randomUUID(),
        s.branch,
        customerId,
        requestId,
        key,
        session.role,
        input.owner,
        normalized.note,
        input.version,
        input.version + 1,
        requestJson,
        createdAt,
        input.version,
        requestId,
      ),
    );
    const confirmed = yield* replay().pipe(
      Effect.catchAll((error) =>
        error.status === 409
          ? Effect.fail(error)
          : fail(
              "The original assignment could not be confirmed. Inspect its reference before retrying.",
              503,
              true,
            ),
      ),
    );
    if (confirmed) return confirmed;
    if (outcome._tag === "Right" && outcome.right === 0)
      return yield* fail(
        "Responsibility changed. Refresh before assigning again.",
      );
    return yield* fail(
      "The original assignment is unconfirmed. Inspect its reference and retry only the same request/key.",
      503,
      true,
    );
  });
