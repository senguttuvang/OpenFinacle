import { Effect } from "effect";
import { BankingError } from "../src/domain/banking";
import { api } from "./api";

/** Ending an expired session is already satisfied. Other failures stay visible. */
export const endDemoSession = () =>
  api<unknown>("/session/end", {}).pipe(
    Effect.catchIf(
      (error) => error.status === 401,
      () => Effect.succeed({ ended: true }),
    ),
    Effect.flatMap((result) =>
      typeof result === "object" &&
      result !== null &&
      "ended" in result &&
      result.ended === true
        ? Effect.void
        : Effect.fail(
            new BankingError({
              message:
                "We could not verify that the demo ended. Try exiting again before leaving this browser.",
              status: 502,
              uncertain: false,
            }),
          ),
    ),
  );
