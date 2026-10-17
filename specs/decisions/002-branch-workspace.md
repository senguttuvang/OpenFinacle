# Decision 002: Custom branch workspace over shared banking services

Date: 2026-10-17. Status: selected implementation direction. Scope: [reference banking reconstruction](../006-reference-banking-experience/spec.md).

## Decision

Keep the customer and staff/branch experiences in custom Next.js/React workspaces backed by the existing Effect application boundary. Use maintained UI primitives for commodity interaction behavior. Preserve Fineract ownership of existing real financial state and add explicit persistent simulations for uncovered capabilities where appropriate.

## Capability fit

The branch capability is a task-oriented banking workspace: customer/account context, teller instructions, independent authorization, reversals, restrictions, reconciliation, exception handling and audit. Its main units are permitted actions and operational state transitions. These need domain-specific screens, keyboard behavior and application controls regardless of the presentation framework.

The existing application already owns banking commands and workflows. Keeping one command/authorization boundary lets customer and staff journeys share the same outcomes and state. Adding another server, identity/persistence owner and workflow implementation would require integration work without removing the specialist banking UI work.

## Alternatives considered

**Payload native admin with custom views:** feasible. Payload's admin itself uses Next.js/React, so this choice is between an existing admin framework and a purpose-built workspace, not mutually exclusive underlying frontend technologies. Native collections, forms, access control and versioned content could reduce work for substantial editable reference records, policies or documents. Custom views can host banking screens, but the banking commands, workflow semantics and custom-view authorization still need implementation. For the currently required operational workspace, that leaves much of the specialist work while adding a new application boundary.

Payload's database transactions support its database operations; they do not establish atomic outcomes across an external banking core or supply banking-specific authorization and reconciliation rules. This is an architectural consequence of separate systems, not a claim that Payload cannot build operational applications.

**React-admin over the command API:** useful list/form and provider infrastructure for a broad CRUD administration workload. Banking instructions and multi-step operational work still require custom methods/pages. Combining it with native Payload administration would duplicate shell/provider responsibilities. Retain the established custom workspace for this scope.

**Custom Next.js workspace:** offers direct control over reference interaction fidelity, operational density, keyboard navigation and task/customer context while reusing current services and deployment. Its cost is owning more screen, form and accessibility code; use supported primitives and meaningful interaction tests rather than building commodity controls from scratch.

## Consequences and reconsideration

This decision supplies no ready-made banking capabilities: the operation contracts, state machines, permissions, UI and tests remain required work. It does not establish ICICI staff-portal parity or production readiness.

Reconsider Payload for a distinct module if substantial content, policy, document or reference-record administration emerges and its native capabilities measurably remove work. Such a module must call the banking application boundary for banking actions and must not become a second owner of balances, postings or approval state.

Evidence checked on 2026-10-17: [Payload admin](https://payloadcms.com/docs/admin/overview), [custom views and their authorization](https://payloadcms.com/docs/custom-components/custom-views), [database transactions](https://payloadcms.com/docs/database/transactions), and [Finacle's branch workspace capability overview](https://www.finacle.com/solution/finacle-universal-banker/). The framework recommendation is an assessment of this application's domain and existing architecture.
