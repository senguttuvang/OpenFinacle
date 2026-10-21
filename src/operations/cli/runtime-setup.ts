import { Command, Options } from "@effect/cli";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Console, Effect } from "effect";
import postgres from "postgres";
import { coreEnvironment } from "../../platform/core-banking/infrastructure/core-environment";
import {
  bootstrapPasswordAcceptable,
  createBootstrapPassword,
} from "./bootstrap-password";
export const execute = (args: string[], stdin?: string) =>
  Effect.tryPromise({
    try: () => {
      const child = Bun.spawn(args, {
        stdin: stdin ? new Blob([stdin]) : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      return Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
    },
    catch: () => new Error("Could not start command"),
  }).pipe(
    Effect.flatMap(([code, stdout, stderr]) =>
      code === 0
        ? Effect.succeed(stdout)
        : Effect.fail(
            new Error(
              `Command ${args[0]} failed (${code}): ${stderr.slice(0, 1500)}`,
            ),
          ),
    ),
  );

export const provision = Command.make(
  "provision",
  {
    file: Options.text("database-file").pipe(
      Options.withDefault("/tmp/openfinacle-postgres.json"),
    ),
    host: Options.text("database-host").pipe(Options.withDefault("")),
    port: Options.integer("database-port").pipe(Options.withDefault(5432)),
  },
  ({ file, host, port }) =>
    Effect.gen(function* () {
      const variables = yield* Effect.tryPromise(
        () => Bun.file(file).json() as Promise<Record<string, string>>,
      );
      const source = variables.DATABASE_PUBLIC_URL || variables.DATABASE_URL;
      if (!source)
        return yield* Effect.fail(
          new Error("Railway database export must contain a database URL"),
        );
      const target = new URL(source);
      if (host) {
        target.hostname = host;
        target.port = String(port);
      }
      if (target.hostname.endsWith(".internal"))
        return yield* Effect.fail(
          new Error(
            "Pass the verified public TCP proxy with --database-host and --database-port",
          ),
        );
      const databaseUrl = target.toString();
      const sql = postgres(databaseUrl, {
        ssl: "require",
        max: 1,
        connect_timeout: 15,
      });
      yield* Effect.acquireUseRelease(
        Effect.succeed(sql),
        (client) =>
          Effect.gen(function* () {
            for (const name of ["fineract_tenants", "fineract_default"]) {
              const present = yield* Effect.tryPromise(
                () =>
                  client`SELECT datname FROM pg_database WHERE datname = ${name}`,
              );
              if (present.length === 0)
                yield* Effect.tryPromise(() =>
                  client.unsafe(`CREATE DATABASE "${name}"`),
                );
            }
          }),
        (client) => Effect.promise(() => client.end()),
      );
      const existing = Bun.file(".dev.vars");
      if (yield* Effect.promise(() => existing.exists()))
        return yield* Effect.fail(
          new Error(
            "Secrets already exist; preserve them and use deploy rather than provision",
          ),
        );
      const password = createBootstrapPassword();
      const token = crypto.randomUUID() + crypto.randomUUID();
      const secrets = {
        CORE_DATABASE: databaseUrl,
        CORE_PASSWORD: password,
        ADMIN_TOKEN: token,
      };
      yield* Effect.tryPromise(() =>
        Bun.write(
          ".dev.vars",
          Object.entries(secrets)
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join("\n"),
        ),
      );
      yield* execute(["chmod", "600", ".dev.vars"]);
      yield* execute(
        ["bunx", "wrangler", "secret", "bulk"],
        JSON.stringify(secrets),
      );
      yield* Console.log(
        "Fineract databases created; deployment secrets stored without disclosure.",
      );
    }),
);

export const deploy = Command.make("deploy", {}, () =>
  Effect.gen(function* () {
    yield* Console.log(yield* execute(["bun", "run", "build"]));
    const sha = (yield* execute(["git", "rev-parse", "HEAD"])).trim();
    yield* Console.log(
      yield* execute([
        "bunx",
        "wrangler",
        "deploy",
        "--var",
        `APP_REVISION:${sha}`,
      ]),
    );
  }),
);

export const initialize = Command.make(
  "initialize",
  {
    url: Options.text("url"),
    stop: Options.boolean("stop").pipe(Options.withDefault(false)),
  },
  ({ url, stop }) =>
    Effect.gen(function* () {
      const lines = (yield* Effect.tryPromise(() =>
        Bun.file(".dev.vars").text(),
      )).split("\n");
      const secrets = Object.fromEntries(
        lines.filter(Boolean).map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at), JSON.parse(line.slice(at + 1)) as string];
        }),
      );
      const call = (
        method: "GET" | "POST" | "PUT",
        path: string,
        body?: unknown,
        initial = false,
      ) =>
        Effect.gen(function* () {
          let req = HttpClientRequest.make(method)(`${url}${path}`).pipe(
            HttpClientRequest.setHeader(
              "Authorization",
              `Bearer ${secrets.ADMIN_TOKEN}`,
            ),
          );
          if (initial)
            req = req.pipe(
              HttpClientRequest.setHeader(
                "X-Core-Authorization",
                `Basic ${btoa("mifos:password")}`,
              ),
            );
          if (body) req = yield* HttpClientRequest.bodyJson(req, body);
          const response = yield* HttpClient.execute(req);
          const text = yield* response.text;
          return { status: response.status, text };
        });
      if (stop) {
        const result = yield* call("POST", "/api/admin/stop-core");
        yield* Console.log(`Core stop HTTP ${result.status}`);
        return;
      }
      const health = yield* call(
        "GET",
        "/api/admin/core/fineract-provider/actuator/health",
      );
      yield* Console.log(
        `Core health HTTP ${health.status}: ${health.text.slice(0, 100)}`,
      );
      if (health.status !== 200)
        return yield* Effect.fail(
          new Error(
            "Core not ready yet. Inspect container logs, then run initialize again.",
          ),
        );
      const authenticated = bootstrapPasswordAcceptable(secrets.CORE_PASSWORD)
        ? yield* call("GET", "/api/admin/core/fineract-provider/api/v1/users/1")
        : { status: 401, text: "" };
      if (authenticated.status === 401) {
        const password = bootstrapPasswordAcceptable(secrets.CORE_PASSWORD)
          ? secrets.CORE_PASSWORD
          : createBootstrapPassword();
        const rotated = yield* call(
          "PUT",
          "/api/admin/core/fineract-provider/api/v1/users/1",
          {
            password,
            repeatPassword: password,
          },
          true,
        );
        if (rotated.status !== 200) {
          const detail = JSON.parse(rotated.text) as {
            errors?: {
              parameterName?: string;
              userMessageGlobalisationCode?: string;
            }[];
          };
          yield* Console.log(
            JSON.stringify(
              detail.errors?.map((item) => ({
                field: item.parameterName,
                code: item.userMessageGlobalisationCode,
              })),
            ),
          );
          return yield* Effect.fail(
            new Error(
              `Initial credential rotation failed (HTTP ${rotated.status}).`,
            ),
          );
        }
        if (password !== secrets.CORE_PASSWORD) {
          secrets.CORE_PASSWORD = password;
          yield* Effect.tryPromise(() =>
            Bun.write(
              ".dev.vars",
              Object.entries(secrets)
                .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                .join("\n"),
            ),
          );
          yield* execute(["chmod", "600", ".dev.vars"]);
          yield* execute(
            ["bunx", "wrangler", "secret", "bulk"],
            JSON.stringify({ CORE_PASSWORD: password }),
          );
        }
        yield* Console.log(
          "Initial core credential rotated and stored privately.",
        );
      } else if (authenticated.status !== 200)
        return yield* Effect.fail(
          new Error(
            `Core authentication failed (HTTP ${authenticated.status}).`,
          ),
        );
      const result = yield* call("POST", "/api/admin/bootstrap", {});
      if (result.status !== 200)
        return yield* Effect.fail(
          new Error(
            `Core product initialization failed (HTTP ${result.status}): ${result.text.slice(0, 1500)}`,
          ),
        );
      yield* Console.log(`Core initialized: ${result.text}`);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
);

export const diagnosticEnvironment = Command.make(
  "diagnostic-environment",
  {},
  () =>
    Effect.gen(function* () {
      const lines = (yield* Effect.tryPromise(() =>
        Bun.file(".dev.vars").text(),
      )).split("\n");
      const values = Object.fromEntries(
        lines.filter(Boolean).map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at), JSON.parse(line.slice(at + 1)) as string];
        }),
      );
      const config = {
        ...coreEnvironment(values.CORE_DATABASE),
        JAVA_TOOL_OPTIONS: "-Xmx512m -XX:+UseContainerSupport",
      };
      yield* Effect.tryPromise(() =>
        Bun.write(
          "/tmp/openfinacle-core.env",
          Object.entries(config)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
        ),
      );
      yield* execute(["chmod", "600", "/tmp/openfinacle-core.env"]);
      yield* Console.log(
        "Protected diagnostic environment created; no secret values printed.",
      );
    }),
);
