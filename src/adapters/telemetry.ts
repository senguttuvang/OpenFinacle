import * as Sentry from "@sentry/cloudflare";
import { Effect } from "effect";
import type { Diagnostic } from "../domain/telemetry";

// The SDK owns envelopes, buffering and rate limits. Record delivery status only.
export const errorTransport: NonNullable<
  Sentry.CloudflareOptions["transport"]
> = (options) =>
  Sentry.createTransport(options, (request) =>
    Effect.runPromise(
      Effect.tryPromise(() =>
        fetch(options.url, {
          method: "POST",
          body: request.body as BodyInit,
          headers: options.headers,
          signal: AbortSignal.timeout(5000),
        }),
      ).pipe(
        Effect.map((response) => {
          console.log(
            JSON.stringify({
              event: "error_delivery",
              status: response.status,
            }),
          );
          return {
            statusCode: response.status,
            headers: {
              "x-sentry-rate-limits": response.headers.get(
                "x-sentry-rate-limits",
              ),
              "retry-after": response.headers.get("retry-after"),
            },
          };
        }),
      ),
    ),
  );

export const reportFailure = (diagnostic: Diagnostic, defect?: unknown) => {
  // Never forward domain messages or provider responses; they may contain customer input.
  const error = new Error(
    diagnostic.status === 500
      ? "Unhandled banking API exception"
      : "Banking dependency unavailable",
  );
  if (defect instanceof Error) error.stack = defect.stack;
  return Sentry.captureException(error, {
    tags: { ...diagnostic, runtime: "worker" },
  });
};

export const sanitizeEvent = (event: Sentry.ErrorEvent): Sentry.ErrorEvent => ({
  type: undefined,
  event_id: event.event_id,
  timestamp: event.timestamp,
  platform: event.platform,
  level: event.level,
  release: event.release,
  environment: event.environment,
  // Reconstruct instead of deleting fields; future SDK fields stay excluded.
  exception: {
    values: event.exception?.values?.map((value) => ({
      type: "Error",
      value: "OpenFinacle server failure",
      stacktrace: {
        frames: value.stacktrace?.frames?.map((frame) => ({
          filename: frame.filename?.split("?")[0],
          function: frame.function,
          lineno: frame.lineno,
          colno: frame.colno,
          in_app: frame.in_app,
        })),
      },
    })),
  },
  tags: Object.fromEntries(
    Object.entries(event.tags ?? {}).filter(([key]) =>
      [
        "requestId",
        "route",
        "method",
        "status",
        "durationMs",
        "uncertain",
        "runtime",
        "probe",
      ].includes(key),
    ),
  ),
});
