import { Effect } from "effect";
import { type Session } from "../../../platform/banking-workspace/domain/banking";
import {
  actOnCardReplacement,
  cardReplacementDetail,
  cardReplacementForKey,
  listCardReplacements,
  submitCardReplacement,
} from "../../../platform/cards/application/card-replacements";
import {
  cardDetail,
  cardForKey,
  changeCard,
  listCards,
} from "../../../platform/cards/application/cards";
import {
  ReplacementCommand,
  ReplacementTerms,
} from "../../../platform/cards/domain/card-replacements";
import { CardCommand } from "../../../platform/cards/domain/cards";
import { failure } from "../request-context";
import { parseJsonRequest as parse } from "../request-json";
export const cardsRoutes = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/card-replacements" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (
        (id !== null && (!id || id.length > 100)) ||
        (id !== null && key !== null)
      )
        return yield* Effect.fail(
          failure("Choose a valid replacement or command reference."),
        );
      return Response.json(
        key !== null
          ? yield* cardReplacementForKey(session, key)
          : id !== null
            ? yield* cardReplacementDetail(session, id)
            : yield* listCardReplacements(session),
      );
    }
    if (path === "/api/card-replacements" && request.method === "POST")
      return Response.json(
        yield* submitCardReplacement(
          session,
          yield* parse(request, ReplacementTerms, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/cards" && request.method === "GET") {
      const id = url.searchParams.get("id");
      const key = url.searchParams.get("key");
      if (id !== null && key !== null)
        return yield* Effect.fail(
          failure("Choose a card or a command reference."),
        );
      return Response.json(
        key !== null
          ? yield* cardForKey(session, key)
          : id !== null
            ? yield* cardDetail(session, id)
            : yield* listCards(session),
      );
    }
    if (path === "/api/card-replacements/action" && request.method === "POST")
      return Response.json(
        yield* actOnCardReplacement(
          session,
          yield* parse(request, ReplacementCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
    if (path === "/api/cards/action" && request.method === "POST")
      return Response.json(
        yield* changeCard(
          session,
          yield* parse(request, CardCommand, false, true),
          request.headers.get("Idempotency-Key") ?? "",
        ),
      );
  });
