# Staged customer account opening

Finacle6 / Beads of-9hc.16. Add a self-service savings journey without removing existing applications, banking, loans, deposits, cards or planning.

## Outcome and boundaries

Seven stages: product/eligibility; fictional contact and simulated verification; personal details; address/tax/occupation; nominee choice; sample identity/address review; review/edit/consents. Back/next and field errors preserve values. Explicit save/resume persists a versioned draft. Final confirmation durably reserves one permanent submission identity. Receipt distinguishes submitted, officer review, independent approval, opening exception and confirmed active account.

Applicants use isolated registry-owned customer scopes. Never reset or reuse the permanent shared new-customer scenario. The customer registry owns scope allocation, directory registration and session selection. Finacle6 owns only onboarding draft state and maps a validated submission into the existing application service. Existing officer/approver Core provisioning remains authoritative. A lost write response permits status inspection only, never automatic account creation replay. An active Core account is required before presenting an opening receipt.

## Demo simplifications

Only adult, resident, single-holder Indian savings applicants are supported. All names/addresses begin with Demo; contact uses @example.test and sample mobile tokens. Date of birth uses adult sample dates. No real PAN, Aadhaar, OTP, documents, camera or identity service. The identity pack and contact checks are explicit simulations. Nomination records an adult nominee or an explicit decline for this demonstration; no legal nomination service is claimed. Tax declaration supports India only. Product is the configured OpenFinacle Everyday Savings synthetic Core product, with no claim that ICICI pricing or terms apply.

The existing maker/checker path is retained. Submission does not mean the account is opened; the user can inspect status and proceed to the portal once confirmed active.

## Integration ownership

New modules only until serialized shared-file lease. Migration0017 is additive and must follow registry0016. No remote migration, seed, merge or release. Finacle4 integrates serially. Finacle5 owns first portal/router lease. Finacle7 owns customer registry0016. Registry contract and final integration details are recorded in plan.md when agreed.

## Verification

Domain validation; durable draft reload/conflict/scope isolation; submission concurrency and response-loss recovery; officer/approver Core provisioning and Core failure; browser stepper back/next/edit/resume/confirmation/receipt and mobile/keyboard/200% zoom. Full exact-branch gate: `DOCKER_HOST=unix:///Users/SenG/.colima/upwork-v2/docker.sock bun run check`. Fixture browser tests are distinct from real-Core evidence.
