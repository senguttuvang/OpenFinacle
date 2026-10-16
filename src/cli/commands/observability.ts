import { Command, Options } from "@effect/cli";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Console, Effect } from "effect";

interface Resource {
  id: string;
  attributes: {
    name?: string;
    team_name?: string;
    token?: string;
    ingesting_host?: string;
    url?: string;
    status?: string;
  };
}
interface Resources {
  data: Resource[];
  pagination?: { next?: string | null };
}
const processCommand = (args: string[], input?: string) =>
  Effect.tryPromise(() => {
    const child = Bun.spawn(args, {
      stdin: input ? new Blob([input]) : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    return Promise.all([child.exited, new Response(child.stdout).text()]);
  }).pipe(
    Effect.flatMap(([code, output]) =>
      code === 0
        ? Effect.succeed(output.trim())
        : Effect.fail(
            new Error(
              `Command ${args[0]} failed (${code}); credentials suppressed.`,
            ),
          ),
    ),
  );
const credentials = processCommand([
  "security",
  "find-generic-password",
  "-a",
  process.env.USER ?? "SenG",
  "-s",
  "betterstack_pearlthoughts_api_token",
  "-w",
]);
const call = <T>(
  token: string,
  url: string,
  body?: unknown,
  method?: "PATCH",
) =>
  Effect.gen(function* () {
    let request = HttpClientRequest.make(
      method ?? (body === undefined ? "GET" : "POST"),
    )(url).pipe(
      HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
    );
    if (body !== undefined)
      request = yield* HttpClientRequest.bodyJson(request, body);
    const response = yield* HttpClient.execute(request);
    if (response.status >= 400)
      return yield* Effect.fail(
        new Error(`Provider HTTP ${response.status}; response suppressed.`),
      );
    return (yield* response.json) as T;
  });
const list = (token: string, url: string) =>
  Effect.gen(function* () {
    const resources: Resource[] = [];
    let next: string | undefined = `${url}?per_page=100`;
    while (next) {
      const result: Resources = yield* call<Resources>(token, next);
      resources.push(...result.data);
      next = result.pagination?.next ?? undefined;
    }
    return resources;
  });
export const observability = Command.make(
  "observability",
  {
    setup: Options.boolean("setup").pipe(Options.withDefault(false)),
    probe: Options.boolean("probe").pipe(Options.withDefault(false)),
    activate: Options.boolean("activate").pipe(Options.withDefault(false)),
    secretsFile: Options.text("secrets-file").pipe(
      Options.withDefault(".dev.vars"),
    ),
  },
  ({ setup, probe, activate, secretsFile }) =>
    Effect.gen(function* () {
      const token = yield* credentials;
      const applicationApi =
        "https://errors.betterstack.com/api/v2/applications";
      const monitorsApi = "https://uptime.betterstack.com/api/v2/monitors";
      const apps = yield* list(token, applicationApi);
      let app = apps.find(
        (a) =>
          a.attributes.name === "OpenFinacle Errors" &&
          a.attributes.team_name === "PearlThoughts",
      );
      if (!app && setup)
        app = (yield* call<{ data: Resource }>(token, applicationApi, {
          name: "OpenFinacle Errors",
          team_name: "PearlThoughts",
          platform: "react_errors",
        })).data;
      if (app && setup) {
        if (!app.attributes.token || !app.attributes.ingesting_host)
          return yield* Effect.fail(
            new Error("Application ingestion configuration is missing"),
          );
        const dsn = `https://${app.attributes.token}@${app.attributes.ingesting_host}/${app.id}`;
        yield* processCommand(
          ["bunx", "wrangler", "secret", "put", "SENTRY_DSN"],
          dsn,
        );
        yield* Console.log(
          `Error application ${app.id} configured; DSN stored privately.`,
        );
      }
      const monitors = yield* list(token, monitorsApi);
      for (const [name, path] of [
        ["OpenFinacle website", "/api/health"],
        ["OpenFinacle banking readiness", "/api/ready"],
      ]) {
        const url = `https://openfinacle.plts.in${path}`;
        let monitor = monitors.find(
          (m) =>
            m.attributes.url === url &&
            m.attributes.team_name === "PearlThoughts",
        );
        if (!monitor && setup)
          monitor = (yield* call<{ data: Resource }>(token, monitorsApi, {
            team_name: "PearlThoughts",
            pronounceable_name: name,
            url,
            monitor_type: "status",
            check_frequency: 180,
            request_timeout: 45,
            paused: true,
            confirmation_period: 120,
            email: true,
            sms: false,
            call: false,
            push: false,
          })).data;
        yield* Console.log(
          JSON.stringify({
            name,
            monitorId: monitor?.id,
            status: monitor?.attributes.status,
            url,
          }),
        );
        if (monitor && activate) {
          const readiness = yield* HttpClient.get(url);
          if (readiness.status !== 200)
            return yield* Effect.fail(
              new Error(
                `Refusing to activate ${name}: HTTP ${readiness.status}`,
              ),
            );
          yield* call(
            token,
            `${monitorsApi}/${monitor.id}`,
            { paused: false },
            "PATCH",
          );
          yield* Console.log(`Activated monitor ${monitor.id}`);
        }
      }
      if (app)
        yield* Console.log(
          `Errors: https://errors.betterstack.com/team/applications/${app.id}`,
        );
      if (probe) {
        const lines = (yield* Effect.tryPromise(() =>
          Bun.file(secretsFile).text(),
        )).split("\n");
        const secret = lines.find((line) => line.startsWith("ADMIN_TOKEN="));
        if (!secret)
          return yield* Effect.fail(new Error("Admin token missing"));
        const admin = JSON.parse(secret.slice("ADMIN_TOKEN=".length)) as string;
        const request = HttpClientRequest.post(
          "https://openfinacle.plts.in/api/admin/telemetry-probe",
        ).pipe(HttpClientRequest.setHeader("Authorization", `Bearer ${admin}`));
        const response = yield* HttpClient.execute(request);
        yield* Console.log(
          JSON.stringify({
            probeStatus: response.status,
            requestId: response.headers["x-request-id"],
            eventId: response.headers["x-error-id"],
          }),
        );
        if (response.status !== 500)
          return yield* Effect.fail(
            new Error("Expected controlled probe failure"),
          );
      }
    }).pipe(Effect.provide(FetchHttpClient.layer)),
);
