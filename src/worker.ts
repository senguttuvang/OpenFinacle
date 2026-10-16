import * as Sentry from "@sentry/cloudflare";
import type { Environment } from "./adapters/environment";
import { errorTransport, sanitizeEvent } from "./adapters/telemetry";
import { handleRequest } from "./http";

export { BankingCore } from "./adapters/container";

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
