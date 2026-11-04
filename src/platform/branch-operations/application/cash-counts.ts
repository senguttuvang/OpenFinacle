import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import {
  CashCountAction,
  CashCountDetail,
  CashCountEvent,
  CashCountInput,
  CashCountKey,
  CashCountList,
  CashSnapshot,
  cashDenominations,
  countActions,
  declaredCashTotal,
  validCountEvent,
  validCountHistory,
} from "../domain/cash-counts";
import { branchCustomer } from "./branch-day";

const fail = (message: string, status = 409, uncertain = false) =>
  Effect.fail(new BankingError({ message, status, uncertain }));
const columns =
  "id,branch_id AS branchId,count_id AS countId,command_key AS key,actor,action,expected_version AS expectedVersion,version,status,request_json AS requestJson,snapshot_json AS snapshot,note,created_at AS createdAt";
const stored = Schema.Struct({
  ...CashCountEvent.fields,
  snapshot: Schema.parseJson(CashSnapshot),
  expectedVersion: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  requestJson: Schema.String,
});
const parse = <A, I>(schema: Schema.Schema<A, I>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message: "Saved count evidence is unavailable or invalid.",
          status: 503,
        }),
    ),
  );
const event = (raw: unknown) =>
  Effect.gen(function* () {
    const row = yield* parse(stored, raw);
    if (row.version !== row.expectedVersion + 1 || !validCountEvent(row))
      return yield* fail("Saved count event identity is invalid.", 503);
    return row;
  });
const quantities = (rows: CashCountInput["quantities"]) =>
  cashDenominations.map((denominationMinor) => ({
    denominationMinor,
    quantity:
      rows.find((r) => r.denominationMinor === denominationMinor)?.quantity ??
      -1,
  }));
const checkedKey = (key: string) =>
  Schema.is(CashCountKey)(key)
    ? Effect.void
    : fail("Use a stable count action reference.", 400);
const detail = (
  session: Session,
  branchId: string,
  id: string,
  confirmed: CashCountEvent | null = null,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const raw = yield* store.one(
      `SELECT ${columns} FROM branch_cash_count_events WHERE branch_id=? AND count_id=? ORDER BY version DESC LIMIT 1`,
      branchId,
      id,
    );
    if (!raw)
      return yield* fail(
        "Count declaration is outside this branch or unavailable.",
        404,
      );
    const record = yield* event(raw),
      rawHistory = yield* store.all(
        `SELECT ${columns} FROM branch_cash_count_events WHERE branch_id=? AND count_id=? ORDER BY version LIMIT 201`,
        branchId,
        id,
      ),
      history = yield* Effect.forEach(rawHistory.slice(0, 200), (r) =>
        event(r),
      );
    const historyComplete = rawHistory.length <= 200;
    const result = yield* parse(CashCountDetail, {
      branchId,
      record,
      history,
      historyComplete,
      actions: historyComplete ? countActions(record, session.role) : [],
      confirmedEvent: confirmed,
    });
    if (!validCountHistory(result))
      return yield* fail("Saved count history cannot be verified.", 503);
    return result;
  });
const forKey = (branchId: string, key: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one(
      `SELECT ${columns} FROM branch_cash_count_events WHERE branch_id=? AND command_key=?`,
      branchId,
      key,
    );
    return row ? yield* event(row) : null;
  });
export const readCashCounts = (session: Session, customerId: string) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId),
      store = yield* Store;
    const rows = yield* store.all(
      `SELECT ${columns} FROM branch_cash_count_events e WHERE branch_id=? AND version=(SELECT max(version) FROM branch_cash_count_events x WHERE x.count_id=e.count_id AND x.branch_id=e.branch_id) ORDER BY created_at DESC,rowid DESC LIMIT 101`,
      branch,
    );
    const records = yield* Effect.forEach(rows.slice(0, 100), (r) => event(r));
    return yield* parse(CashCountList, {
      branchId: branch,
      observedAt: yield* Clock.currentTimeMillis,
      limit: 100,
      limited: rows.length > 100,
      records,
    });
  });
export const readCashCount = (
  session: Session,
  customerId: string,
  id: string,
) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId);
    return yield* detail(session, branch, id);
  });
export const readCashCountForKey = (
  session: Session,
  customerId: string,
  key: string,
) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId);
    yield* checkedKey(key);
    const found = yield* forKey(branch, key);
    if (!found)
      return yield* fail(
        "No count action is recorded with this reference at this read. Retry only the original request/key.",
        404,
      );
    return yield* detail(session, branch, found.countId, found);
  });
const replay = (
  session: Session,
  branch: string,
  key: string,
  requestJson: string,
) =>
  Effect.gen(function* () {
    const found = yield* forKey(branch, key);
    if (!found) return null;
    if (found.actor !== session.role || found.requestJson !== requestJson)
      return yield* fail(
        "This original count reference belongs to different details or actor.",
      );
    return yield* detail(session, branch, found.countId, found);
  });
const save = (
  session: Session,
  branch: string,
  key: string,
  id: string,
  expectedVersion: number,
  action: CashCountEvent["action"],
  status: CashCountEvent["status"],
  snapshot: CashSnapshot,
  note: string,
  requestJson: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store,
      createdAt = new Date(yield* Clock.currentTimeMillis).toISOString();
    const outcome = yield* Effect.either(
      store.run(
        "INSERT INTO branch_cash_count_events(id,branch_id,count_id,command_key,actor,action,expected_version,version,status,request_json,snapshot_json,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        crypto.randomUUID(),
        branch,
        id,
        key,
        session.role,
        action,
        expectedVersion,
        expectedVersion + 1,
        status,
        requestJson,
        JSON.stringify(snapshot),
        note,
        createdAt,
      ),
    );
    const resolved = yield* replay(session, branch, key, requestJson).pipe(
      Effect.catchAll((error) =>
        error.status === 409
          ? Effect.fail(error)
          : fail(
              "The original count action could not be confirmed. Inspect its key before retrying.",
              503,
              true,
            ),
      ),
    );
    if (resolved) return resolved;
    if (outcome._tag === "Left" && action !== "declare") {
      const current = yield* detail(session, branch, id).pipe(
        Effect.catchAll(() => Effect.succeed(null)),
      );
      if (current && current.record.version !== expectedVersion)
        return yield* fail(
          "The saved count changed. Refresh its history before another action.",
        );
    }
    return yield* fail(
      "The original count action is unconfirmed. Inspect its key before retrying the same request.",
      503,
      true,
    );
  });
export const declareCashCount = (
  session: Session,
  customerId: string,
  input: CashCountInput,
  key: string,
) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId);
    if (session.role !== "officer")
      return yield* fail(
        "Only the officer demo role may declare a count.",
        403,
      );
    yield* checkedKey(key);
    const value = yield* Schema.decodeUnknown(CashCountInput, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message:
              "Provide every valid denomination quantity, count date, label and note.",
            status: 400,
          }),
      ),
    );
    const normalized = {
      boxType: value.boxType,
      label: value.label.trim(),
      countDate: value.countDate,
      quantities: quantities(value.quantities),
      note: value.note.trim(),
    };
    if (
      !normalized.label ||
      !normalized.note ||
      normalized.countDate > bankingDate(yield* Clock.currentTimeMillis)
    )
      return yield* fail(
        "Count label/note are required and the reported IST count date cannot be in the future.",
        400,
      );
    const command = { action: "declare", version: 0, ...normalized },
      requestJson = JSON.stringify({ actor: session.role, command });
    const original = yield* replay(session, branch, key, requestJson);
    if (original) return original;
    const snapshot = yield* parse(CashSnapshot, {
      source: "synthetic_declaration",
      currency: "INR",
      ...normalized,
      totalMinor: declaredCashTotal(normalized.quantities),
    });
    return yield* save(
      session,
      branch,
      key,
      crypto.randomUUID(),
      0,
      "declare",
      "submitted",
      snapshot,
      normalized.note,
      requestJson,
    );
  });
export const actCashCount = (
  session: Session,
  customerId: string,
  input: CashCountAction,
  key: string,
) =>
  Effect.gen(function* () {
    const { branch } = yield* branchCustomer(session, customerId);
    yield* checkedKey(key);
    const command = yield* Schema.decodeUnknown(CashCountAction, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(
        () =>
          new BankingError({
            message: "Choose a valid original count action/version and note.",
            status: 400,
          }),
      ),
    );
    const required =
      command.action === "review" || command.action === "return"
        ? "approver"
        : "officer";
    if (session.role !== required)
      return yield* fail(
        `This count action requires the ${required} demo role.`,
        403,
      );
    const normalized = {
      id: command.id,
      version: command.version,
      action: command.action,
      note: command.note.trim(),
      ...(command.action === "resubmit"
        ? { quantities: quantities(command.quantities) }
        : {}),
    };
    if (!normalized.note)
      return yield* fail("Record a note for this count action.", 400);
    const requestJson = JSON.stringify({
        actor: session.role,
        command: normalized,
      }),
      original = yield* replay(session, branch, key, requestJson);
    if (original) return original;
    const current = yield* detail(session, branch, command.id);
    if (!current.historyComplete)
      return yield* fail(
        "Count history coverage is incomplete. Further changes are withheld.",
        503,
      );
    if (
      current.record.version !== command.version ||
      !countActions(current.record, session.role).includes(command.action)
    )
      return yield* fail(
        "The count state or version changed. Refresh its history before another action.",
      );
    const snapshot =
      command.action === "resubmit"
        ? {
            ...current.record.snapshot,
            quantities: quantities(command.quantities),
            totalMinor: declaredCashTotal(command.quantities),
          }
        : current.record.snapshot;
    const validSnapshot = yield* parse(CashSnapshot, snapshot);
    const status =
      command.action === "review"
        ? "reviewed"
        : command.action === "return"
          ? "returned"
          : command.action === "withdraw"
            ? "withdrawn"
            : "submitted";
    return yield* save(
      session,
      branch,
      key,
      command.id,
      command.version,
      command.action,
      status,
      validSnapshot,
      normalized.note,
      requestJson,
    );
  });
