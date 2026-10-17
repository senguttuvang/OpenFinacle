import { Effect } from "effect";
import type { Session } from "../domain/banking";
import { openingAdvice } from "../domain/deposit-advice";
import { depositDetail } from "./deposits";
import { recurringDetail } from "./recurring-deposits";

export const depositAdvice = (
  session: Session,
  kind: "fixed" | "recurring",
  id: string,
) =>
  Effect.gen(function* () {
    return kind === "fixed"
      ? yield* openingAdvice({
          kind,
          detail: yield* depositDetail(session, id),
        })
      : yield* openingAdvice({
          kind,
          detail: yield* recurringDetail(session, id),
        });
  });
