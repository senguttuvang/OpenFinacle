# Reference experience delivery plan

Date: 2026-10-17. Requirements: [specification](spec.md). Execution ledger: Beads `of-9hc`. This is a delivery design, not a claim that its stages are complete.

## Architecture

Retain separate customer and branch workspaces in the existing Next.js/React frontend. Preserve shared accessible interaction primitives while allowing customer guidance and staff operational density to differ. The [branch decision](../decisions/002-branch-workspace.md) explains the custom workspace selection.

Keep application commands, authorization, workflow transitions and audit orchestration in the Effect application layer. Fineract owns existing financial state. D1 owns workflow/read-model and appropriate persistent synthetic product state; synthetic adapters must be explicitly selected and remain separate from core records. UI code consumes public application contracts and never imports core/storage adapters.

Do not add Payload or React-admin as another application owner solely for navigation, visual polish or generic CRUD. Reconsider a distinct administration module when substantial editorial/reference-record requirements justify it. This plan does not authorize a runtime, hosting or cost expansion.

## Evidence and traceability design

Create a sanitized coverage register whose entries include: stable capability/page ID, parent navigation, generic destination, source URLs or source type/date, evidence class, access gate, observed states, reconstruction state, backend mode, verification reference and unresolved differences. Keep live task state in Beads rather than Markdown checklists.

Use separate evidence dimensions. For example, a destination can be directly observed at the landing-page level, documented for a gated confirmation step, implemented with a simulated adapter and not yet browser-verified. Do not collapse these into a single completed status. Generic service names establish destination discovery only.

Collect schema names/types and static navigation paths only after sanitization. Exclude response values, authenticated query strings, private local paths, browser/profile identifiers and real account/product details. Do not import browser recordings, screenshots, HAR files or copied bank data into the repository.

## Delivery sequence

1. Enumerate the complete reachable navigation hierarchy and service directory, then inspect nested pages and states with explicit route/content readiness checks. Record access/action gates without submitting real instructions. Keep this browsing phase focused to reduce inactivity expiry.
2. Research the gated customer journeys through official public documentation. Correlate supplied Finacle operational material with authoritative branch capability sources. Validate shortcut semantics and record version/bank uncertainty. Infer missing staff behavior explicitly.
3. Produce per-capability page/state contracts, backend-mode assignments and a gap analysis against existing app behavior. The nine retail families and branch capability taxonomy in the specification establish coverage areas, not a predetermined implementation count.
4. Implement bounded vertical slices across customer UI, application command/read contracts, chosen adapters and staff work queues. Cover form validation, review, completion/failure, history and audit together rather than adding all navigation before its workflows.
5. Verify each slice against generalized reference evidence with synthetic data; verify real adapter effects separately from simulation behavior. Preserve existing working financial journeys throughout delivery.
6. Run the exact-branch delivery gate, open/review/merge private PRs, synchronize canonical main and record verified coverage. Report unresolved evidence and implementation gaps without claiming parity.

## Verification strategy

Use focused unit/contract tests for actual state-transition, ownership, authorization and adapter invariants. Integration tests establish persistent simulation behavior, consistent customer/staff outcomes, idempotency and uncertain-outcome handling. Browser tests cover navigation, reference form sequences, validation, dialogs, review/edit, outcome/history, keyboard behavior, role scope and responsive layouts.

Use synthetic OpenFinacle screenshots and fixtures only. Compare layout geometry, typography and generalized control behavior against sanitized observations or official public examples. Do not put real bank screens into visual baselines.

Run `bun run check` from the final worktree before integration; it includes strict type/static checks, tests, export and Worker/container dry run. Run appropriate UI checks for each implemented slice. Recheck saved journey entry under three seconds and authenticated core readiness after applicable deployments. A documentation-only change introduces no banking mutation and requires no live financial scenario reset.

## Initial evidence limits

Live retail observation is the strongest source for customer interaction reconstruction. Supplied Finacle operational notes are the strongest available source for branch capability discovery; menu shortcuts identify operations but do not establish their full workflow. Primary-source research checks capabilities and architecture, while domain knowledge supplies explicitly unverified hypotheses. Neither replaces missing reference evidence.

Research has established the nine retail navigation families, primary menu destinations and service-request category families. Several landing pages have been visited. This is partial reconnaissance: not all descendants, forms, validation rules, API schemas, gated states or responsive variants have been inspected. Fast exploratory samples that captured content before navigation settled are invalid and must be revisited. No internal staff portal access or exhaustive shortcut verification is established.

The earlier modernization already supplies command navigation, selected aliases, customer styling and staff queues over existing workflows. Those features do not satisfy the broader reconstruction criteria by themselves. This phase records the expanded requirements before further implementation.

## Public primary sources

- [ICICI retail netbanking overview](https://www.icici.bank.in/personal-banking/ways-to-bank/net-banking): public customer capability discovery; not evidence of every authenticated page.
- [Finacle Universal Banker](https://www.finacle.com/solution/finacle-universal-banker/): role-oriented branch workspace and cross-product customer context; not proof of ICICI's staff implementation.
- [Payload admin architecture](https://payloadcms.com/docs/admin/overview), [custom views](https://payloadcms.com/docs/custom-components/custom-views), [access control](https://payloadcms.com/docs/access-control/overview) and [database transactions](https://payloadcms.com/docs/database/transactions): platform capabilities informing the branch decision.

These links were checked on 2026-10-17. Implementation-specific claims require source and test evidence beyond these overview pages.
