# Implementation

Observability belongs in HTTP, browser and provider adapters; banking domain rules and posting ownership remain unchanged. Use @sentry/cloudflare and @sentry/browser against a dedicated Better Stack Errors application. Use explicit event allowlisting, no replay/PII capture and no automatic network breadcrumbs. Keep request and dependency latency in structured logs and Server-Timing; CPU profiling and Java exception instrumentation are outside this change.

Add separate liveness/readiness uptime monitors through the project CLI, with existing PearlThoughts credentials kept in memory and protected secret storage. Add a protected server telemetry probe, plus regression coverage for redaction, readiness failures and correlation. Verify ingestion acceptance and monitor status, then exercise both banking journeys. Native request logs cannot reconstruct an incident that occurred before instrumentation.
