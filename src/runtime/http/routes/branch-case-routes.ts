import { Effect, Schema } from "effect";
import type { Session } from "../../../platform/banking-workspace/domain/banking";
import { branchCustomer } from "../../../platform/branch-operations/application/branch-day";
import {
  assignCaseResponsibility,
  readCaseResponsibility,
} from "../../../platform/branch-operations/application/service-work/responsibility";
import {
  ResponsibilityCommand,
  ResponsibilityKey,
} from "../../../platform/branch-operations/domain/service-work/responsibility";
import {
  actOnServiceCase,
  serviceCase,
} from "../../../platform/service-requests/application/service-cases";
import { caseActions } from "../../../platform/service-requests/domain/service-cases";
import { parseJsonRequest } from "../request-json";
export const branchCaseRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    if (url.pathname === "/api/branch/service-responsibility") {
      if (request.method === "GET")
        return Response.json(
          yield* readCaseResponsibility(
            session,
            url.searchParams.get("customerId") ?? "",
            url.searchParams.get("id") ?? "",
            url.searchParams.get("key") ?? undefined,
          ),
        );
      if (request.method === "POST") {
        const input = yield* parseJsonRequest(
          request,
          Schema.Struct({
            customerId: Schema.NonEmptyString,
            requestId: Schema.NonEmptyString,
            key: ResponsibilityKey,
            command: ResponsibilityCommand,
          }),
          false,
          true,
        );
        return Response.json(
          yield* assignCaseResponsibility(
            session,
            input.customerId,
            input.requestId,
            input.command,
            input.key,
          ),
        );
      }
      return null;
    }
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
