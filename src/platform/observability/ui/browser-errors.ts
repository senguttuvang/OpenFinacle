import * as Sentry from "@sentry/browser";
import { safeRoute } from "../domain/telemetry";

export const reportTransportFailure = (path: string) =>
  Sentry.captureException(new Error("Banking API transport failed"), {
    tags: { route: safeRoute(`/api${path}`) },
  });
export const reportBrowserException = (error: Error) =>
  Sentry.captureException(error);
export const sanitizeBrowserEvent = (
  event: Sentry.ErrorEvent,
  origin: string,
): Sentry.ErrorEvent => ({
  type: undefined,
  event_id: event.event_id,
  timestamp: event.timestamp,
  release: event.release,
  environment: event.environment,
  platform: "javascript",
  level: event.level,
  exception: {
    values: event.exception?.values?.map((value) => ({
      type: "Error",
      value: "OpenFinacle browser exception",
      stacktrace: {
        frames: value.stacktrace?.frames
          ?.filter((frame) => frame.filename?.startsWith(`${origin}/_next/`))
          .map((frame) => ({
            filename: frame.filename?.split("?")[0].split("#")[0],
            function: frame.function,
            lineno: frame.lineno,
            colno: frame.colno,
          })),
      },
    })),
  },
  tags: {
    runtime: "browser",
    route: safeRoute(String(event.tags?.route ?? "/")),
  },
});
