# Startup diagnosis and observability

The welcome screen must not spin indefinitely without explaining dependency availability. Website liveness and banking readiness are distinct. Readiness checks must exercise D1 and an authenticated, read-only Fineract operation. They must never create accounts or post money.

Capture server failures and browser exceptions in Better Stack using official Sentry SDKs, with release, normalized route, request ID and duration. Exclude request/response bodies, headers, cookies, personal details, document names, arbitrary error messages and breadcrumbs. Keep structured request/core timings in Cloudflare logs and expose safe request IDs to users.

Check readiness before creating a workspace. Bound dependency waits and browser waiting; failed or uncertain writes are never automatically retried. Do not claim the original incident's exact cause without contemporaneous evidence. Monitoring must detect dependency failure even when the website remains up.
