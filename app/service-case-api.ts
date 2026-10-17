import { Effect, Schema } from "effect";
import { BankingError } from "../src/domain/banking";
import { caseActions } from "../src/domain/service-cases";
import { api } from "./api";

const delivery = Schema.Literal(
  "none",
  "pending",
  "dispatched",
  "ready_for_collection",
  "delivered",
  "cancelled",
  "not_recorded",
);
const caseDetail = Schema.Struct({
  request: Schema.Struct({
    id: Schema.NonEmptyString,
    bank_id: Schema.NonEmptyString,
    kind: Schema.NonEmptyString,
    detail: Schema.String,
    status: Schema.Literal(
      "open",
      "in_progress",
      "needs_information",
      "awaiting_approval",
      "fulfilled",
      "rejected",
      "cancelled",
    ),
    created_at: Schema.String,
    updated_at: Schema.String,
    payload: Schema.String,
    submitted_payload: Schema.String,
    version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    request_key: Schema.NullOr(Schema.String),
    outcome_note: Schema.String,
    updated_by: Schema.String,
    delivery_status: delivery,
    profile_patch: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  history: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        request_id: Schema.String,
        actor: Schema.String,
        from_status: Schema.NullOr(Schema.String),
        to_status: Schema.String,
        note: Schema.String,
        detail: Schema.String,
        payload: Schema.String,
        delivery_status: delivery,
        created_at: Schema.String,
      }),
    ),
  ),
  actions: Schema.mutable(Schema.Array(Schema.Literal(...caseActions))),
});

export const serviceCaseApi = (path: string, body?: unknown, key?: string) =>
  api<unknown>(path, body, key).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknown(caseDetail)(value).pipe(
        Effect.mapError(
          () =>
            new BankingError({
              message:
                "The saved request response could not be verified. Refresh its status before another action.",
              status: 503,
            }),
        ),
      ),
    ),
  );
