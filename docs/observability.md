# Banking startup and error monitoring

Website liveness is `GET /api/health`. Banking readiness is `GET /api/ready`: it reads D1 and performs an authenticated Fineract office lookup. Neither endpoint posts money or creates a workspace. Readiness has a five-second storage deadline and a 35-second core deadline. A container startup attempt waits about 20 seconds for its port; it does not stop a warming container. A core call, including response consumption, is bounded at 60 seconds. No write is automatically retried.

The welcome screen checks readiness before starting initialization, names its stage, and bounds browser waiting at three minutes for workspace creation. A timeout does not prove a write failed. Inspect existing instruction/workspace state before retrying. Initialization remains synchronous; this change does not introduce a durable background provisioning workflow or recover abandoned partial workspaces.

## Error tracking

Official `@sentry/cloudflare` and `@sentry/browser` SDKs send events to the **OpenFinacle Errors** application in the **PearlThoughts** Better Stack team. `SENTRY_DSN` is a Cloudflare secret. `/api/telemetry-config` exposes the ingestion-only DSN to the browser, as required by browser SDKs; it is not a management API token. Management credentials never enter the application bundle.

Explicit SDK data-collection settings and final event allowlists exclude cookies, request/response bodies and headers, query strings, customer records, documents, breadcrumbs, error text, source context and local variables. Reports retain release, sanitized stack locations and allowlisted diagnostic tags. Replay, automatic browser breadcrumbs, CPU profiling and Java agents are not enabled. API failures and Java failures surfaced through the API are reported; Java-internal stack traces remain in container logs.

Cloudflare structured logs record `http_request_started`, `http_request`, `core_request_started`, `core_request` and `error_delivery`. Match records by `requestId`. Durations identify whether the delay is in the HTTP workflow or a particular core call. `X-Request-ID` and `Server-Timing` are returned to the caller; captured server failures also return `X-Error-ID`. SDK delivery logs record HTTP status only. Use Cloudflare's Workers Observability or `bunx wrangler tail`, and avoid exporting raw native request logs containing session headers.

## Operations

From the checked-out repository:

- `bun run cli observability` lists the dedicated application and monitor status without disclosing credentials.
- `bun run cli observability --setup` creates missing resources and configures the Worker DSN. New monitors start paused.
- `bun run cli observability --activate` first verifies both live endpoints, then activates the monitors.
- `bun run cli observability --probe --secrets-file /protected/path/.dev.vars` sends an authenticated synthetic server exception. Expect HTTP 500, a request ID and an error event ID; verify delivery rather than treating the 500 alone as proof.

The two uptime monitors check website liveness and banking readiness every three minutes, with a 45-second request timeout and 120-second failure confirmation. Email alerts are enabled; calls and SMS are disabled. Readiness monitoring exercises the core regularly and therefore keeps the demo container warm, consuming normal container runtime resources. This trades idle suspension for demo availability; pause the readiness monitor if intentional sleeping is desired.

Run `bun run test:e2e --workers=2` against the deployed revision. The readiness regression blocks initialization on dependency failure; the browser telemetry regression confirms that a synthetic error reaches ingestion without its sensitive-looking message. The two banking journeys verify actual Fineract balances and postings.

## Original incident evidence

At investigation time the core actuator returned HTTP 200 with UP in approximately 1.6 seconds. The previous app health check did not exercise dependencies, the container port wait was 30 minutes, and no per-operation timings or exception tracker existed. These establish a diagnosis gap and an excessive wait, not the exact cause of the user's earlier stalled request. Do not claim retrospective root-cause proof.
