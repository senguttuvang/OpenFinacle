import { Clock, Effect, Schema } from "effect";
import { BankingError, type Session } from "../domain/banking";
import { Store } from "../domain/ports";
import {
  allowedCaseActions,
  type CaseAction,
  type CaseDetail,
  type CaseEvent,
  caseTransition,
  type ServiceCase,
} from "../domain/service-cases";
import { serviceDefinition, validateServiceFields } from "../domain/services";
import { requiredBank } from "./banking";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status }));
const fieldsFrom = (payload: string) =>
  Schema.decodeUnknown(
    Schema.parseJson(
      Schema.Record({ key: Schema.String, value: Schema.String }),
    ),
  )(payload).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "The saved case details could not be read. Ask the service desk to inspect this case.",
          status: 500,
        }),
    ),
  );
const now = Clock.currentTimeMillis.pipe(
  Effect.map((instant) => new Date(instant).toISOString()),
);

export const serviceCase = (session: Session, id: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const record = yield* store.one<ServiceCase>(
      "SELECT * FROM service_requests WHERE id=? AND bank_id=?",
      id,
      session.bank_id,
    );
    if (!record) return yield* fail("Service request not found.", 404);
    const history = yield* store.all<CaseEvent>(
      "SELECT id,request_id,actor,from_status,to_status,note,detail,payload,delivery_status,created_at FROM service_case_events WHERE request_id=? AND bank_id=? ORDER BY rowid",
      id,
      session.bank_id,
    );
    const definition = serviceDefinition(record.kind);
    const result: CaseDetail = {
      request: record,
      history,
      actions: definition
        ? allowedCaseActions(record, definition, session.role)
        : [],
    };
    return result;
  });

export const listServiceCases = (
  session: Session,
  offset: number,
  query: string,
  deliveries = false,
) =>
  Effect.gen(function* () {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000 ||
      query.length > 80
    )
      return yield* fail(
        "Choose a valid request page and search of at most 80 characters.",
        400,
      );
    const store = yield* Store;
    const search = `%${query.trim().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const where =
      "bank_id=? AND (id LIKE ? ESCAPE '\\' OR kind LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')" +
      (deliveries ? " AND delivery_status NOT IN ('none','not_recorded')" : "");
    const values = [session.bank_id, search, search, search];
    const count = yield* store.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM service_requests WHERE ${where}`,
      ...values,
    );
    if (!count)
      return yield* fail(
        "The request count could not be read. Try the request list again.",
        503,
      );
    const requests = yield* store.all<ServiceCase>(
      `SELECT * FROM service_requests WHERE ${where} ORDER BY created_at DESC,rowid DESC LIMIT 25 OFFSET ?`,
      ...values,
      offset,
    );
    return { requests, total: count.total, offset, limit: 25 };
  });

export const serviceCaseForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
      return yield* fail("Choose a valid submission reference.", 400);
    const store = yield* Store;
    const record = yield* store.one<{ id: string }>(
      "SELECT id FROM service_requests WHERE bank_id=? AND request_key=?",
      session.bank_id,
      key,
    );
    if (!record)
      return yield* fail(
        "No service request has been recorded with this submission reference.",
        404,
      );
    return yield* serviceCase(session, record.id);
  });

export const submitServiceCase = (
  session: Session,
  code: string,
  fields: Readonly<Record<string, string>>,
  key: string,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* fail(
        "Submit a service request from the customer workspace.",
        403,
      );
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key))
      return yield* fail(
        "A stable request key of 8–100 letters, numbers, hyphens or underscores is required.",
        400,
      );
    const definition = serviceDefinition(code);
    if (!definition)
      return yield* fail("Choose a service from the directory.", 400);
    const normalized = yield* validateServiceFields(definition, fields);
    const payload = JSON.stringify(normalized);
    const bank = yield* requiredBank(session);
    if (!bank.customer_account)
      return yield* fail(
        "Open your account before submitting a service request.",
      );
    const store = yield* Store;
    const id = crypto.randomUUID();
    const timestamp = yield* now;
    const detail = definition.fields
      .map((f) => `${f.label}: ${normalized[f.key]}`)
      .join("\n");
    yield* store.run(
      "INSERT INTO service_requests(id,bank_id,kind,detail,payload,submitted_payload,request_key,outcome_note,updated_by,updated_at,delivery_status) VALUES(?,?,?,?,?,?,?,'Request submitted','customer',?,?) ON CONFLICT(bank_id,request_key) DO NOTHING",
      id,
      session.bank_id,
      code,
      detail,
      payload,
      payload,
      key,
      timestamp,
      definition.delivery === "physical" ? "pending" : "none",
    );
    const saved = yield* store.one<ServiceCase>(
      "SELECT * FROM service_requests WHERE bank_id=? AND request_key=?",
      session.bank_id,
      key,
    );
    if (!saved)
      return yield* fail(
        "The request outcome could not be confirmed. Inspect your request list before retrying.",
        503,
      );
    if (saved.kind !== code || saved.submitted_payload !== payload)
      return yield* fail(
        "This request key was already used for different details. Inspect the original request before starting another.",
      );
    return yield* serviceCase(session, saved.id);
  });

export const actOnServiceCase = (
  session: Session,
  input: {
    id: string;
    version: number;
    action: CaseAction;
    note: string;
    fields?: Readonly<Record<string, string>>;
  },
) =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(input.version) || input.version < 0)
      return yield* fail("A valid case version is required.", 400);
    const { request: record } = yield* serviceCase(session, input.id);
    if (record.version !== input.version)
      return yield* fail(
        "This request changed. Refresh its history before taking another action.",
      );
    const definition = serviceDefinition(record.kind);
    if (!definition)
      return yield* fail(
        "This request needs its dedicated product workflow and cannot be fulfilled as a service case.",
      );
    if (input.fields && input.action !== "provide_information")
      return yield* fail(
        "Case details can only change when the customer provides requested information.",
        400,
      );
    let fields = yield* fieldsFrom(record.payload);
    const transition = yield* caseTransition(
      record,
      definition,
      session.role,
      input.action,
      input.note,
      fields,
    );
    if (input.action === "provide_information")
      fields = yield* validateServiceFields(definition, input.fields ?? {});
    if (["submit_for_approval", "fulfil"].includes(input.action))
      yield* validateServiceFields(definition, fields);
    const payload = JSON.stringify(fields);
    const detail =
      input.action === "provide_information"
        ? definition.fields
            .map((f) => `${f.label}: ${fields[f.key]}`)
            .join("\n")
        : record.detail;
    const timestamp = yield* now;
    const store = yield* Store;
    const changed = yield* store.one<{ id: string }>(
      "UPDATE service_requests SET status=?,delivery_status=?,outcome_note=?,updated_by=?,updated_at=?,payload=?,detail=?,version=version+1,request_key=COALESCE(request_key,'imported:'||id) WHERE id=? AND bank_id=? AND version=? RETURNING id",
      transition.status,
      transition.delivery_status,
      transition.note,
      session.role,
      timestamp,
      payload,
      detail,
      input.id,
      session.bank_id,
      input.version,
    );
    if (!changed)
      return yield* fail(
        "This request changed while the action was being recorded. Refresh its history before continuing.",
      );
    return yield* serviceCase(session, input.id);
  });
