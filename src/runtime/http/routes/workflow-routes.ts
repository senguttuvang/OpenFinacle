import { Effect, Schema } from "effect";
import {
  addBeneficiary,
  createCommand,
  submitApplication,
} from "../../../platform/banking-workspace/application/banking";
import { type Session } from "../../../platform/banking-workspace/domain/banking";
import { Store } from "../../../platform/banking-workspace/domain/ports";
import type { Environment } from "../environment";
import { appSchema, commandSchema } from "../request-context";
import { parseJsonRequest as parse } from "../request-json";
export const workflowRoutes = (
  request: Request,
  env: Environment,
  session: Session,
) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    yield* Store;
    if (path === "/api/application" && request.method === "POST")
      return Response.json(
        yield* submitApplication(session, yield* parse(request, appSchema)),
      );
    if (path === "/api/beneficiaries" && request.method === "POST")
      return Response.json(
        yield* addBeneficiary(
          session,
          (yield* parse(request, Schema.Struct({ name: Schema.String }))).name,
        ),
      );
    if (path === "/api/commands" && request.method === "POST")
      return Response.json(
        yield* createCommand(
          session,
          yield* parse(request, commandSchema),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
  });
