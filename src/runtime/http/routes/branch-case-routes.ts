import { Effect, Schema } from "effect";
import type { Session } from "../../../platform/banking-workspace/domain/banking";
import { branchCustomer } from "../../../platform/branch-operations/application/branch-day";
import {
  actOnServiceCase,
  serviceCase,
} from "../../../platform/service-requests/application/service-cases";
import { caseActions } from "../../../platform/service-requests/domain/service-cases";
import { parseJsonRequest } from "../request-json";
export const branchCaseRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const read =
      url.pathname === "/api/branch/service-case" && request.method === "GET";
    const act =
      url.pathname === "/api/branch/service-case/action" &&
      request.method === "POST";
    if (!read && !act) return null;
    const { scoped } = yield* branchCustomer(
      session,
      url.searchParams.get("customerId") ?? "",
    );
    if (read)
      return Response.json(
        yield* serviceCase(scoped, url.searchParams.get("id") ?? ""),
      );
    const input = yield* parseJsonRequest(
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
      yield* actOnServiceCase(scoped, { ...input, note: input.note ?? "" }),
    );
  });
