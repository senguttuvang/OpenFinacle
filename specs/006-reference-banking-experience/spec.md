# Reference banking experience reconstruction

Date: 2026-10-17. Status: requirements recorded; discovery and implementation incomplete. Execution: Beads `of-9hc`.

## Outcome and scope

Reconstruct the reachable ICICI retail netbanking experience in OpenFinacle and build a corresponding operational staff/branch workspace. Match the reference's information architecture, page hierarchy, interaction sequences, form behavior and state coverage. A visual refresh or a collection of menu links does not satisfy this requirement. Use real backend capabilities where available and explicit persistent simulations where needed.

This extends the narrower [workspace modernization](../005-banking-workspaces/spec.md). That earlier delivery supplied presentation, command navigation and staff queues; it did not establish complete page coverage, API mapping or banking feature parity. Preserve its working capabilities while replacing presentation decisions where reference evidence requires it.

OpenFinacle remains an independent synthetic demonstration with its own identity. It must not suggest that it is operated or endorsed by ICICI or Infosys. The repository remains private; this specification does not authorize a visibility change or disclosure of account data.

## User scenarios and acceptance

### P1: Complete a customer journey with reference interaction fidelity

Given a persistent synthetic customer, when the customer navigates a product or service journey, the app presents the corresponding reference page structure, fields, choices, validation, review and outcome states. Returning to a page or signing into the saved scenario preserves completed activity and pending work. Controls lead to working journeys rather than decorative placeholders.

An independent acceptance scenario follows a selected journey from its navigation entry through field validation, review, confirmation, history and return navigation. Use synthetic fixtures and document any intentional difference from the reference.

### P1: Continue customer work in the branch workspace

Given an application, service instruction or transaction requiring staff work, the appropriately authorized staff member can find it, inspect customer and account context, perform the permitted action and see its audit history. Where independent authorization is required, the originating operator cannot approve their own instruction. The resulting state appears consistently in customer and staff experiences.

An independent acceptance scenario starts in the customer workspace, continues with maker/checker roles in the branch workspace and verifies the final customer-visible outcome against the configured backend.

### P1: Trust the source and coverage claims

Given a discovered destination, a reviewer can identify its evidence source, observation depth, required product/entitlement, implementation status, backend mode and verification. A menu label alone is not evidence that its page, API or workflow has been explored. An inferred staff workflow is not presented as observed ICICI staff behavior.

### P2: Operate efficiently with a keyboard

Given a staff task, an operator can find and open its screen using searchable commands, navigate its form and recover from validation errors without losing context. Commands respect role, disabled and busy states. Opening a screen never implicitly posts, authorizes, reverses or changes identity.

## Discovery and evidence requirements

- **E-01 — Page inventory:** inventory every discovered top-level destination, nested page, tab, drawer, modal, form step and linked product flow within the authorized retail scope. Record the parent/entry point and discover additional destinations recursively. Keep destination discovery separate from page and state verification.
- **E-02 — Observation depth:** record layout, navigation, visible control names, field types, required/optional rules, help, defaults, dependencies, validation timing, review/confirmation sequence, empty/loading/error states, session-expiry behavior and return/back behavior. Record observable responsive behavior and keyboard behavior.
- **E-03 — Coverage labels:** classify evidence as directly observed, supported by official public documentation, supported by supplied dated operational material, or inferred. Separately record discovery-only, page-inspected, states-inspected, gated/unavailable, reconstructed and verified implementation states. Preserve unknowns explicitly.
- **E-04 — Access boundaries:** record product, entitlement, external-site, authentication or action gates. Do not claim inaccessible screens have been observed. Reconstruct documented or inferred behavior with that provenance visible in the coverage register; verification gaps remain open.
- **E-05 — Passive API evidence:** observe requests produced by authorized navigation without replaying banking mutation APIs. Record sanitized endpoint templates, methods, schema field names/types, pagination/filtering, status/error shapes and triggering UI states where safely observable. Request method alone does not establish whether an operation changes banking state. Private API compatibility is not a requirement for our backend.
- **E-06 — Staff evidence:** derive branch capabilities from supplied Finacle operational material and current authoritative sources. Retail observation is not evidence of internal staff screens, permissions or processes. Cross-check menu aliases against documented operations and identify bank/version-specific differences.
- **E-07 — Research discipline:** use current primary sources for product/framework facts and official bank documentation for public customer journeys. Use domain knowledge to propose gaps and hypotheses, not to fabricate observed behavior. Record source links, date and confidence. Research performed so far is focused and incomplete.

## Customer capability scope

Explore each family and its discovered descendants. The following is an initial taxonomy, not a complete inventory or a claim that all features are implemented:

- **Overview and profile:** relationship/portfolio summary, account shortcuts, personal details, spending views, alerts, navigation and session handling.
- **Accounts:** account listing and detail enquiry, account activity, statements and exports, account aggregation and relevant account preferences.
- **Payments and transfers:** own-account and beneficiary transfers, payee selection/management, available payment methods, scheduling, review/confirmation, transaction history/status, utility bills/recharges, FASTag, tax and remittance destinations.
- **Deposits:** fixed, recurring and goal-based deposits; amount/tenure/maturity choices, funding, nominee choices, enquiry, servicing and certificates where available.
- **Cards:** credit, debit, prepaid and forex card journeys discovered through navigation or services; statements, payments, rewards, limits, controls, replacement, PIN-related flows and servicing.
- **Loans:** loan overview, application entry, repayment/statement/document enquiries, servicing and credit-score entry points. Opening a navigation destination does not authorize an application or a credit enquiry on the real site.
- **Investments:** mutual funds, securities/demat, retirement and government savings products, portfolio enquiries and linked external destinations.
- **Insurance:** policy enquiry, linking, purchase/service entry points and available public insurance/scheme journeys.
- **Customer service:** request creation and tracking, deliverable tracking, account changes, statements, transaction disputes, card servicing, cheque/DD services, government schemes, account/policy linking, digital document services, mailbox, complaints and security controls.

## Staff and branch capability scope

These are required areas to investigate and specify, with individual operations validated before implementation. They are not a claim of current bank-specific functionality:

- Customer relationship search/enquiry and account context; onboarding, documents, KYC review and account origination.
- Teller cash receipts/payments, transaction enquiry, reversals, cash positions and teller/vault handover where supported by evidence.
- Maker/checker queues, independent financial and nonfinancial authorization, rejection/return with reasons and entitlement/limit checks.
- Account restrictions and release, customer maintenance, deposit servicing, card/cheque/DD service handling and customer request fulfilment.
- Payment operations, reconciliation, uncertain-outcome investigation and exception queues; clearing and settlement capabilities supported by documented scope.
- Branch start/end-of-day checks, unresolved work, operational reports and audit enquiry; reference/product administration where required.

Build a dense task-oriented workspace with persistent customer/task context, discoverable menu aliases, work queues, clear operational states and safe explicit actions. Never invent branch totals or operational metrics from a single-customer fixture. The [branch architecture decision](../decisions/002-branch-workspace.md) selects a custom Next.js workspace over the shared application services.

## Backend and persistence requirements

- **B-01:** classify each capability as Fineract-backed, application-workflow-backed, externally integrated or simulated. Record the mode in its contract and verification evidence; expose the demonstration boundary clearly without cluttering each product interaction with implementation details.
- **B-02:** Fineract remains authoritative for existing real account lifecycle, balances and postings. Do not replace an unavailable core response with a fabricated balance, create a shadow ledger for those accounts or silently switch a failed real operation to a mock.
- **B-03:** implement missing product/service capabilities through explicit domain ports and persistent synthetic adapters. Simulation must model validation, permitted transitions, review, completion/failure and history, with consistent customer/staff views. A static success toast is insufficient.
- **B-04:** separate simulated product data from Fineract financial records. Any journey that affects a real account must use its verified core command boundary; a simulated success cannot imply an actual core posting or an external-network settlement.
- **B-05:** enforce server-side ownership, permissions, command identity, independent authorization and audit behavior in the relevant real and simulated paths. Ambiguous real posting outcomes require reconciliation and block unsafe retries.
- **B-06:** preserve permanent synthetic scenarios and saved read models across reloads, visits, role changes and deployment. Entry remains under three seconds without per-visit provisioning, resets or hidden core readiness requests. Show synchronization state truthfully. Do not automatically reset shared scenarios.

## Experience and quality requirements

- **U-01:** reproduce the reference's navigation grouping, layout hierarchy, field organization, density, terminology, available actions and interaction order. Record justified deviations explicitly. Generic modern banking styling alone is insufficient.
- **U-02:** cover responsive layouts, readable financial typography, visible focus, label/error association, accessible dialogs, focus return, reduced motion and complete keyboard form operation. Keep customer and staff commands role-scoped.
- **U-03:** validate asynchronous page readiness using both route and rendered content/state. Do not mark a page inspected from the previous screen's content during a transition.
- **U-04:** preserve entered synthetic data across intended back/edit steps; prevent duplicate submissions; define cancel, abandon, expired-session and recoverable-error outcomes for each journey.
- **U-05:** verify keyboard shortcuts and menu aliases against sources before claiming Finacle compatibility. Existing aliases are demonstration conveniences. Browser-reserved shortcuts and different bank/version mappings require explicit handling.

## Privacy and real-site inspection

Use only authorized read-only navigation on the real bank. Human authentication/OTP remains human. Keep internet banking in the exact regular headed browser instance authenticated by the operator; never transfer that session to headless or restart it to change modes. Short inactivity timeouts require focused inspection; disclose pauses and verify session state before resuming.

Do not submit real transfers, beneficiary changes, service instructions, card controls, applications, approvals or other banking actions during research. Stop at action/authentication gates and record the missing evidence.

Specifications, issues, commits, PRs, tests, fixtures, screenshots, research artifacts and logs must exclude real names/contact details, customer/account/card identifiers, balances, transactions, loan holdings/amounts, beneficiaries, documents, credentials, cookies, tokens and authenticated URLs. Do not capture a private screen first with the intention of redacting it later. Use generalized UI observations and independently invented synthetic examples. Public source links must contain no account/session parameters. These rules apply even while the repository is private.

## Completion criteria

1. Every discovered destination has a coverage record with source, access/depth, states, implementation, backend mode and verification. Report the discovered denominator and remaining gaps; do not use a fixed guessed page count.
2. Each in-scope implemented journey has a reference-to-app comparison covering navigation, layout, forms, validation, review/outcome, history and responsive/keyboard behavior using synthetic data. Gated or inferred reference behavior remains identified as such.
3. Each committed customer and branch capability works end to end against its selected real or simulated backend, including meaningful error and role/approval tests. A route, menu alias or static mock alone does not count as completion.
4. Contract tests cover adapters; integration tests establish persistence, authorization, cross-workspace consistency and financial boundaries; browser tests establish journey and interaction behavior. Prepare isolated scenarios before mutating tests; never silently reset shared demonstrations.
5. Existing financial invariants and fast persistent entry remain verified. Run the full repository gate from the exact delivery branch, review the complete diff and follow the PR integration workflow.
6. Final reporting distinguishes requirements recorded, reference evidence collected, features reconstructed and features verified. Full parity cannot be claimed while required journeys or verification gaps remain unresolved.
