# Bounded saved-dashboard reads

Preserve the permanent scenarios and three-second entry requirement from spec 004. Initial entry still reads only the saved Fineract-derived financial view; missing or failed data must fail explicitly without provisioning, core readiness calls, resets, fabricated balances or silent fallback.

After relationship authorization and completion of the financial-view read/refresh, compose application, beneficiaries, commands, audit, document metadata and service requests with at most three concurrent readonly workflow queries. Keep the same relationship filters, columns, ordering, limits, role filtering and response contract. Preserve the financial-view boundary before these reads, including refresh and snapshot invalidation semantics. Any workflow read failure fails the entire dashboard; never show an invented empty collection as success.

A delayed-store integration test must prove actual overlap, the concurrency bound, financial-first ordering, no entry writes/core calls, preserved customer filtering and truthful query failure. Run the full exact-source gate and workspace browser checks, then measure both prepared journey selections and cold reload against the deployed source. Record timing misses rather than masking them with retries or resets. This is an application-only change and requires no workflow migration.
