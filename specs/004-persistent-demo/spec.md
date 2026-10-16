# Permanent demo journeys with three-second entry

Selecting either customer journey must display its usable dashboard within three seconds in live browser measurements. Entry must not create, fund, or query financial accounts, and must not wait on Java readiness. Keep two permanent named demo workspaces, one for onboarding and one for an existing customer. Switching journeys or returning later preserves their synthetic data. They are shared demo scenarios, not isolated real-user accounts.

Seed the core-backed scenarios explicitly ahead of use. No pool, Cron, background replenishment or per-visitor provisioning is needed. Persist financial read models derived from actual Fineract responses. Label their synchronization time; an unavailable core must not prevent viewing saved data or imply that transactions will succeed. Mutations retain existing approval, ownership and uncertainty controls and refresh the read model. Do not fabricate balances or silently retry uncertain postings.

Supply a protected operator command to seed, refresh and explicitly restart a scenario. Restarting selects a newly seeded scenario while retaining old financial records. Demo scenario selection and role switching must be enabled explicitly by demo configuration; absence of a production identity integration must fail closed outside demo mode. Fineract and application banking logic remain independent of demo seeding.

Verify both journeys under three seconds, no core calls during entry/reload, correct read-model updates after postings, saved scenario switching, safe engine-unavailable behavior, demo-mode boundaries and existing banking workflows. This change does not claim complete production security or regulatory readiness.
