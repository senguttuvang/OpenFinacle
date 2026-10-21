import { Command, Options } from "@effect/cli";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Console, Effect } from "effect";

export const demo = Command.make(
  "demo",
  {
    url: Options.text("url").pipe(
      Options.withDefault("https://openfinacle.plts.in"),
    ),
    secrets: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
    journey: Options.choice("journey", ["new", "existing", "both"]).pipe(
      Options.withDefault("both"),
    ),
    restart: Options.boolean("restart").pipe(Options.withDefault(false)),
    backfill: Options.boolean("backfill").pipe(Options.withDefault(false)),
  },
  ({ url, secrets, journey, restart, backfill }) =>
    Effect.gen(function* () {
      const origin = new URL(url);
      if (
        origin.origin !== "https://openfinacle.plts.in" &&
        origin.hostname !== "localhost"
      )
        return yield* Effect.fail(
          new Error(
            "Refusing to send administrative credentials to an unrecognized host.",
          ),
        );
      const raw = yield* Effect.tryPromise(() => Bun.file(secrets).text());
      const line = raw
        .split("\n")
        .find((value) => value.startsWith("ADMIN_TOKEN="));
      if (!line)
        return yield* Effect.fail(
          new Error("ADMIN_TOKEN is missing from the protected secrets file."),
        );
      const token = JSON.parse(line.slice("ADMIN_TOKEN=".length)) as string;
      const call = <T>(path: string, body: unknown) =>
        Effect.gen(function* () {
          const request = yield* HttpClientRequest.post(
            `${origin.origin}/api/admin/demo/${path}`,
          ).pipe(
            HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
            HttpClientRequest.bodyJson(body),
          );
          const response = yield* HttpClient.execute(request).pipe(
            Effect.mapError(
              () =>
                new Error(
                  "Demo administration connection failed; credential-bearing request details are suppressed.",
                ),
            ),
          );
          if (response.status !== 200)
            return yield* Effect.fail(
              new Error(
                `Demo administration HTTP ${response.status}. Inspect correlated server logs before retrying setup; no financial outcome is assumed.`,
              ),
            );
          return (yield* response.json.pipe(
            Effect.mapError(
              () =>
                new Error("Could not read the demo administration response."),
            ),
          )) as T;
        });
      for (const selected of journey === "both"
        ? ["new", "existing"]
        : [journey]) {
        yield* Console.log(
          `${restart ? "Restarting" : "Preparing"} permanent ${selected} scenario…`,
        );
        yield* call("prepare", { journey: selected, restart });
        yield* Console.log(
          `${selected} scenario ready; core-backed read model saved.`,
        );
      }
      if (backfill) {
        const result = yield* call<{ banks: { id: string }[] }>("backfill", {});
        let count = 0;
        for (const bank of result.banks) {
          yield* call("backfill", { bankId: bank.id });
          yield* Console.log(
            `Saved legacy workspace view ${++count}/${result.banks.length}`,
          );
        }
      }
    }).pipe(Effect.provide(FetchHttpClient.layer)),
);
