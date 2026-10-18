import { Effect, Schema } from "effect";
import { type Session } from "../../../platform/banking-workspace/domain/banking";
import { Store } from "../../../platform/banking-workspace/domain/ports";
import {
  actOnServiceCase,
  listServiceCases,
  serviceCase,
  serviceCaseForKey,
  submitServiceCase,
} from "../../../platform/service-requests/application/service-cases";
import { caseActions } from "../../../platform/service-requests/domain/service-cases";
import { serviceCatalog } from "../../../platform/service-requests/domain/services";
import type { Environment } from "../environment";
import { failure } from "../request-context";
import { parseJsonRequest as parse } from "../request-json";
export const serviceRoutes = (
  request: Request,
  env: Environment,
  session: Session,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    yield* Store;
    if (path === "/api/service-catalog" && request.method === "GET")
      return Response.json({ services: serviceCatalog });
    if (path === "/api/service-cases" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (
        (id !== null && (!id || id.length > 100)) ||
        (id !== null && key !== null)
      )
        return yield* Effect.fail(
          failure("Choose a valid request reference.", 400),
        );
      return Response.json(
        id
          ? yield* serviceCase(session, id)
          : key !== null
            ? yield* serviceCaseForKey(session, key)
            : yield* listServiceCases(
                session,
                Number(url.searchParams.get("offset") ?? 0),
                url.searchParams.get("query") ?? "",
                url.searchParams.get("view") === "deliveries",
              ),
      );
    }
    if (path === "/api/service-cases" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          code: Schema.String,
          fields: Schema.Record({ key: Schema.String, value: Schema.String }),
        }),
      );
      return Response.json(
        yield* submitServiceCase(
          session,
          input.code,
          input.fields,
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    }
    if (path === "/api/service-cases/action" && request.method === "POST") {
      const input = yield* parse(
        request,
        Schema.Struct({
          id: Schema.String,
          version: Schema.Number,
          action: Schema.Literal(...caseActions),
          note: Schema.optional(Schema.String),
          fields: Schema.optional(
            Schema.Record({ key: Schema.String, value: Schema.String }),
          ),
        }),
      );
      return Response.json(
        yield* actOnServiceCase(session, { ...input, note: input.note ?? "" }),
      );
    }
  });
