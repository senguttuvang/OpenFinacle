import * as Sentry from "@sentry/browser";
import { Effect } from "effect";
import { api } from "../../banking-workspace/ui/api";
import { sanitizeBrowserEvent } from "./browser-errors";

export const initializeTelemetry = () =>
  api<{ dsn?: string; release: string }>("/telemetry-config").pipe(
    Effect.tap((config) =>
      Effect.sync(() => {
        if (!config.dsn || Sentry.isInitialized()) return;
        Sentry.init({
          dsn: config.dsn,
          release: config.release,
          environment: "production",
          defaultIntegrations: false,
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            databaseQueryData: false,
            stackFrameVariables: false,
            frameContextLines: 0,
          },
          integrations: [
            Sentry.globalHandlersIntegration(),
            Sentry.browserApiErrorsIntegration(),
          ],
          sendClientReports: false,
          beforeSend: (event) =>
            sanitizeBrowserEvent(event, window.location.origin),
        });
      }),
    ),
    Effect.catchAll(() => Effect.void),
  );
