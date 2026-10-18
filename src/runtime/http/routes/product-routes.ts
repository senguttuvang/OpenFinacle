import { Effect } from "effect";
import type { Session } from "../../../platform/banking-workspace/domain/banking";
import { customerProfile } from "../../../platform/customers/application/profile";
import type { Environment } from "../environment";
import { cardsRoutes } from "./cards-routes";
import { depositsRoutes } from "./deposits-routes";
export const productRoutes = (
  request: Request,
  _env: Environment,
  session: Session,
) =>
  Effect.gen(function* () {
    const deposits = yield* depositsRoutes(request, session);
    if (deposits) return deposits;
    const cards = yield* cardsRoutes(request, session);
    if (cards) return cards;
    if (
      new URL(request.url).pathname === "/api/profile" &&
      request.method === "GET"
    )
      return Response.json(yield* customerProfile(session));
  });
