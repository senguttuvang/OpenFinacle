"use client";
import { Effect } from "effect";
import { useEffect } from "react";
import { reportBrowserException } from "./browser-errors";
import { initializeTelemetry } from "./telemetry";
export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    void Effect.runPromise(
      initializeTelemetry().pipe(
        Effect.tap(() => Effect.sync(() => reportBrowserException(error))),
      ),
    );
  }, [error]);
  return (
    <html lang="en">
      <body>
        <h1>The banking screen could not load</h1>
        <p>
          An error report has been recorded when monitoring is reachable.
          Refresh to inspect any pending instruction before trying it again.
        </p>
        <button type="button" onClick={reset}>
          Reload screen
        </button>
      </body>
    </html>
  );
}
