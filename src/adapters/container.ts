import { Container } from "@cloudflare/containers";
import { Effect } from "effect";
import { coreEnvironment } from "./core-environment";
import type { Environment } from "./environment";

export class BankingCore extends Container<Environment> {
  defaultPort = 8080;
  sleepAfter = "12h";
  envVars = coreEnvironment(this.env.CORE_DATABASE);
  override fetch(request: Request): Promise<Response> {
    return Effect.runPromise(
      Effect.gen(this, function* () {
        yield* Effect.tryPromise(() =>
          this.startAndWaitForPorts({
            ports: [8080],
            cancellationOptions: {
              instanceGetTimeoutMS: 10000,
              portReadyTimeoutMS: 20000,
              waitInterval: 1000,
            },
          }),
        );
        return yield* Effect.tryPromise(() => this.containerFetch(request));
      }).pipe(
        Effect.catchAll(() =>
          Effect.succeed(
            Response.json(
              {
                error:
                  "The banking engine is warming up or unavailable. Try again shortly; no financial outcome is assumed.",
              },
              { status: 503 },
            ),
          ),
        ),
      ),
    );
  }
}
