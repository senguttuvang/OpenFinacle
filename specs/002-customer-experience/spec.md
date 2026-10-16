# New and existing customer banking experiences

Date: 2026-10-16. Status: accepted requirements; implementation pending.

## Purpose

Provide two entry journeys within the Fineract-backed demonstration. Keep OpenFinacle identity and synthetic data while closely following the navigation, information hierarchy, layout and interaction patterns observed in the owner's ICICI personal netbanking session.

The authenticated reference review has been requested but has not yet been completed. The capability candidates below are requirements to assess, not claims about observed ICICI screens or already implemented OpenFinacle functionality.

## New customer

Start as an applicant with no active account. Capture synthetic identity/address documents and product choices, show submission status, support staff requests for corrections, and require independent approval before core account activation. Then demonstrate initial deposit, beneficiary setup, transfer, salary receipt and statements. Opening an account does not itself create a deposit.

## Existing customer

Start with a real active Fineract account populated with synthetic, core-posted opening funds and dated activity. Do not make the visitor perform onboarding. Provide customer landing/dashboard, account summary/detail, transaction history and downloadable statements, transfers, beneficiary management, service requests and profile/navigation patterns informed by reference research.

Any historical sample transactions must follow supported business-date/accounting rules; do not fabricate a transaction history or balance in the frontend. Seed once per isolated workspace using durable command identities. Reloading, switching personas or repeating initialization must not fund the account again.

## Staff and operations

Staff can inspect the selected customer's account, onboarding evidence, approvals, restrictions, supported reversals, service requests and audit inside the same isolated workspace. Preserve maker-checker separation and ownership checks. Identify the active demo persona and provide a clear return to the customer view.

## Reference research protocol

Use the authorized managed SenG Chrome copy over loopback CDP. The owner enters credentials and any OTP directly. After login, continue through the managed headless handoff; observe dashboard, menus, account summaries, transfer form structure, beneficiary screens, statement controls and service-request navigation where safely accessible.

Record generic labels, layout relationships, component states and feature availability. Store only sanitized design observations in the repository. Do not persist credentials, session tokens, actual account identifiers, balances, beneficiaries, statements or transaction history. Do not commit raw authenticated screenshots or browser snapshots. Use synthetic names and amounts in all demo assets.

Research is read-only: do not submit payments, add beneficiaries, change profile/security settings or request actual bank services. Stop at any step that would create a bank-side instruction. Review forms only where navigation itself has no transactional consequence.

Keep OpenFinacle branding and a clear synthetic-demo identity. Closely reproduce observed structural patterns without representing the demo as ICICI, copying its authentication credentials, or connecting the demo to the real account. Report restricted/unobserved screens rather than infer a complete feature inventory.

## Acceptance

1. A visitor explicitly chooses new customer or existing customer.
2. New customer begins without an active account and completes the approval journey.
3. Existing customer begins with an active core-backed account and realistic synthetic activity.
4. Both experiences use Fineract for every supported financial effect and statement balance.
5. Re-entering either journey retains workspace state without duplicate accounts or funding.
6. A sanitized reference inventory links each observed feature to an implemented, planned or explicitly simulated demo capability; unobserved features are labelled separately.
7. Existing-customer desktop hierarchy and navigation closely follow the observed reference; responsive layouts remain usable and keyboard accessible.
8. Transfers, pending approvals, restrictions, failures and uncertain outcomes have explicit states; no visual success before confirmed posting.
9. No real-bank data or authenticated browser artifacts enter Git, public assets or seeded workspaces.

## Verification boundary

This specification does not claim the second entry journey or ICICI-inspired redesign is shipped. Implementation must verify both starting states, seed idempotency, workspace isolation, account ownership, transfer/reversal invariants, statements and responsive UI through the existing quality gates and deployed browser journeys.
