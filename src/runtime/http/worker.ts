import * as Sentry from "@sentry/cloudflare";
import {
  errorTransport,
  sanitizeEvent,
} from "../../platform/observability/infrastructure/telemetry";
import type { Environment } from "./environment";
import { handleRequest } from "./http";

export { BankingCore } from "../../platform/core-banking/infrastructure/container";

export default Sentry.withSentry(
  (env: Environment) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    release: env.APP_REVISION,
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
    sendClientReports: false,
    beforeSend: sanitizeEvent,
    transport: errorTransport,
  }),
  {
    fetch(request: Request, env: Environment): Promise<Response> {
      return new URL(request.url).pathname.startsWith("/api/")
        ? handleRequest(request, env)
        : env.ASSETS.fetch(request);
    },
  },
);
