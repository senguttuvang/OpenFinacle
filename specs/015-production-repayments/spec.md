# Production Loan Repayment

This specification defines the recommended first production financial workflow: a borrower pays one scheduled instalment on an existing personal loan, through one approved collection route, and the lender can trace collection, loan allocation, customer receipt and bank reconciliation. It records future requirements, not a delivered service or permission to move real money.

## Product Boundary

- **Initial customer:** a borrower of one named regulated lender, with an authenticated identity and an independently verified existing loan.
  - **Product:** one configured INR personal-loan product and one performing-loan cohort.
  - **Payment:** borrower-initiated collection through one contracted provider/bank route, selected by the lender.
  - **Amount:** one supported non-final scheduled instalment. The verified core quotation must leave the loan active; final instalments and payoff remain separate scope. Partial, excess, duplicate and unexpected receipts enter controlled exception handling.
  - **Ownership:** the lender owns the loan, financial policies, collection destination and operating responsibilities. The application does not become the lender by implementing this workflow.
- **Complete journey:** sign in → inspect owned due amount → review/confirm → collect → post to the authoritative loan → issue receipt/statement → reconcile settlement and GL.
  - **Non-happy paths:** pending/unknown outcomes, lost responses, duplicate/out-of-order events, rejected collection, missing posting, unexpected funds, return, dispute and controlled reversal.
  - **Financial dates:** lender-approved receipt recognition, posting trigger, value date and customer-interest treatment, including delayed provider settlement. Do not charge a borrower extra interest because the integration delayed recognition of an already accepted payment.
- **Separate scope:** new-loan origination/underwriting, home/vehicle collateral, disbursement, recurring mandates, arbitrary partial payments, full payoff, overpayment allocation, restructuring, debt collection campaigns, multiple lenders/currencies/rails and deposits.
  - **Exception obligation:** excluding a product feature does not permit discarding unexpected money. Hold, investigate and return/resolve it under the approved operating contract.
  - **Launch authority:** sandbox tests, production-quality code and provider access do not authorize a live pilot. Explicit live-money authority and institution acceptance remain required.

## Existing Foundation And Required Change

- **Reuse selectively:** Effect/TypeScript application boundaries, financial command identity, immutable review/history, original-outcome recovery patterns, core adapters, loan statements and protected migration/restore tooling.
  - **Current source:** the [savings-funded repayment contract](../006-reference-banking-experience/contracts/loan-repayments.md), `src/platform/lending/application/loan-repayment.ts`, `src/platform/lending/infrastructure/loan-repayments.ts` and their recovery tests.
  - **Historical pilot:** proves one bounded synthetic savings-to-loan path; it does not prove external collection, production identity, whole-loan servicing or a bank operating model.
- **Funding boundary:** the current adapter performs an atomic Fineract savings withdrawal plus loan repayment. The new workflow begins with money collected externally.
  - **No double debit:** externally collected funds must not trigger a second savings withdrawal. Define and prove a supported externally funded loan-posting port and approved clearing-account mapping before implementation.
  - **No shadow loan ledger:** Fineract remains authoritative for the supported loan's balance, schedule and allocation. Application records track intent, evidence, workflow and reconciliation.
  - **No implicit promotion:** demo personas, OTPs, shared scenarios, default tenant/account assumptions, pilot administration credentials and synthetic data remain isolated from production.
- **Technical choices:** retain the established stack unless a measured capability/security/operating gap warrants a separately reviewed decision.
  - **Adapters:** provider payloads stop at typed ports; pin core API/source behavior and verify the configured deployed version.
  - **Durability:** select appropriate durable execution, inbox/outbox and uniqueness mechanisms after the chosen rail's failure contract is known. No distributed exactly-once guarantee is assumed.

## Core Capabilities And Accountable Owners

- **Lender product/finance:** approved instalment, allocation, interest/fees, calendar, value date, clearing accounts and customer disclosures.
  - **Accounting:** balanced journals for gross collection, fees, net settlement, loan principal/interest/charges, returns and suspense; independent finance reconciliation.
- **Identity/security/compliance:** real borrower/staff IAM, MFA or policy-approved step-up, account binding, tenant isolation, least privilege, consent, data retention and access audit.
  - **Customer eligibility:** bind an existing approved loan and performing cohort; this workflow must not automatically decide new credit eligibility.
- **Payments/core engineering:** provider verification, exact minor-unit amounts, durable commands, correlation, one supported posting and positive original-outcome recovery.
  - **Unknown outcome:** preserve evidence and prevent unsafe retries; a timeout is not proof that collection/posting failed.
- **Operations/support:** reconciliation, ageing exceptions, duplicate funds, customer support references, authorised returns/reversals, incident response and provider escalation.
  - **Independent approval:** required for sensitive staff exceptions according to lender policy; do not force the demo officer/approver sequence onto every routine customer payment.
- **SRE/independent assurance:** agreed load/SLOs, dependency health, backup/restore, failover, RTO/RPO, controlled deployment and recovery with pending financial operations preserved.

## Financial Workflow Contract

1. **Establish ownership and due amount.** Authenticate the borrower; resolve the institution and owned core loan server-side; read an authoritative supported due amount and product/version/business-date observation.
   - Bind lender, customer, loan, amount, currency, terms, value-date policy, expiry and consent to an immutable intent.
   - Refresh and require new review when a changed due amount or term invalidates the original offer. Expiry never erases an already dispatched instruction.
2. **Reserve the original before collection.** Persist intent, consent, command identity, provider reference and the appropriate concurrency reservation before a possible side effect.
   - An unreadable reservation acknowledgement dispatches nothing. Browser refresh and recovery refer to the same original attempt.
   - A new attempt after a definite failure needs the permitted new consent/reference. An uncertain attempt cannot trigger a fresh collection.
3. **Initiate and observe collection.** Use only the contracted lender-approved route and destination. Distinguish provider authorization, capture/accepted funds, failure, return and settlement.
   - Validate webhook signatures using the original body and correct key version; durably ingest before acknowledging receipt.
   - Deduplicate event identity and independently enforce payment/intent identity. Two genuinely different payments for the same instalment are an excess/duplicate-funds exception, not an event to silently drop.
   - Handle events out of order; a delayed failure observation must not overwrite stronger verified success. Query original provider status when notifications are missing or contradictory.
4. **Post to the loan once.** Apply the approved recognition trigger and value date; submit one externally funded repayment to the verified core with original correlation.
   - Confirm using an owned unreversed core transaction, exact amount/currency/date and allocation components that reconcile to the total. A balance movement alone is insufficient.
   - The core computes the supported principal/interest/fee allocation. Persist positive proof and refresh views separately.
   - A lost posting response stays uncertain. A failed statement refresh does not relabel a confirmed repayment failed. No unverified second debit or posting is permitted.
   - Concurrent payments from other lender channels must be handled by the core's supported locking/allocation rules. If the original amount is no longer applicable after collection, retain the actual funds and resolve the excess/exception; do not silently change consent, discard money or collect again.
5. **Show the customer the durable outcome.** Present collected/pending, loan-posted, failed or investigation status and the relevant timestamp/reference.
   - A receipt identifies the confirmed financial stage. A final reconciliation status is not fabricated from a browser redirect or payment notification.
   - Statements use authoritative loan transactions and approved value dates. Screen-reader, keyboard, mobile and enlarged-text journeys retain review and recovery behavior.
6. **Reconcile and operate.** Match application intent, provider payment, core transaction, settlement batch/bank credit and GL records.
   - Account for gross-versus-net fees, partial batches, delayed settlement, missing postings, reversals and unidentified money.
   - Maintain owned exceptions, ageing, evidence and permitted resolution actions. Later returns/disputes may reopen an operational case while retaining original paid history.
   - Corrections use authorised compensating transactions and linked history; never delete financial facts or make an unresolved operation disappear.

## State And Data Boundaries

- **Separate state dimensions:** collection, loan posting and settlement/reconciliation each have their own authoritative observations.
  - **Collection:** prepared, submitted, pending, accepted, definitely failed, uncertain; later return/dispute is a linked event, not erased history.
  - **Loan posting:** not dispatched, reserved, executing, confirmed, definitely failed, uncertain; controlled reversal remains a linked financial outcome.
  - **Settlement:** awaiting, matched, exception, reversed/adjusted, resolved with evidence.
  - **Transition rule:** persist the source, timestamp and version; order events by supported financial semantics, not arrival time alone.
- **Application authority:** intent, consent, ownership, event inbox/outbox, original references, durable status, evidence and case decisions.
  - **Core authority:** loan account, outstanding, allocation, repayment/charge/reversal entries and supported accounting.
  - **Provider/bank authority:** collection, actual fund movement, fees, settlement and returns.
  - **Finance acceptance:** approved mappings and independent GL reconciliation; every amount has one financial authority and traceable provenance.
- **Recovery:** reconstruct derived views and pending work from durable originals without repeating an unknown money instruction.
  - **Migration:** additive, source-bound and reversible at application level without erasing financial history; prove restore and pending-operation recovery before cutover.
  - **Data governance:** minimise identity/payment data, redact logs, restrict evidence access and apply lender-approved retention/deletion rules without deleting mandatory audit.

## Mandatory Acceptance Scenarios

- **A01 — Normal repayment:** one collected amount produces one owned core repayment, correct allocation/value date, a receipt and independently matched settlement/GL.
- **A02 — Duplicate and concurrent input:** repeated clicks, concurrent tabs, provider redelivery and worker restarts produce no extra collection or posting.
- **A03 — Reservation acknowledgement loss:** no financial dispatch follows an unverified reservation; recovery preserves the original reference.
- **A04 — Collection accepted, core unavailable:** preserve funds/evidence, show an honest pending state and recover the one intended posting without collecting again.
- **A05 — Core posted, response lost:** read-only original inspection confirms the original transaction; no repost and no duplicate customer charge.
- **A06 — Authenticity and isolation:** forged callbacks, wrong signature/key/amount/currency/destination, foreign loan and cross-institution/customer requests fail safely and are auditable.
- **A07 — Events and dates:** out-of-order/delayed events, expiry, business-day boundaries and race with interest/other payments follow approved recognition and value-date rules. Final-instalment quotations are rejected before collection; a loan closed by another channel while collection is pending creates a controlled funds exception.
- **A08 — Excess and unmatched money:** distinct duplicate charges, partial/unexpected amounts and unmatched funds enter owned exception handling with no silent loss.
- **A09 — Reconciliation:** delayed/partial/missing settlements and gross/net-fee differences resolve against provider, bank, core and GL evidence.
- **A10 — Returns and reversals:** authorised corrections preserve original postings/receipt history, change the core through supported operations and reconcile resulting journals.
- **A11 — Customer and staff journey:** accessible review, consent, reload recovery, receipt, statement, case enquiry and restricted exception actions pass meaningful browser/API acceptance.
- **A12 — Recovery and independent acceptance:** agreed load/SLOs and RTO/RPO pass, restored pending operations do not duplicate money, and lender finance/risk/security/operations sign the controlled pilot contract.

## Decisions Required Before Implementation Or Launch

- **Before implementing a financial adapter:** named lender/legal entity, exact portfolio/product, permitted money flow, contracted collection route, accounting/fee mapping, recognition trigger/value date and verified core fit.
- **Before admitting customer data:** approved IAM/identity/account binding, privacy/retention, hosting/residency and access model.
- **Before claiming operational readiness:** approved SLO/load envelope, RTO/RPO, restore evidence, reconciliation owner, support/on-call rota and provider incident/continuity arrangements.
- **Before live money:** jurisdiction-specific compliance review, required agreements/assurance, independent lender UAT, pilot cohort/exposure/stop criteria and explicit live-money authorization.
- **Still unresolved:** none of the lender, rail/provider, policy thresholds, production environment, numeric service objectives or launch approvals is selected by this specification. The first Beads decision task owns resolution; no placeholder can satisfy it.

## Verification

- **Core and provider contracts:** verify the pinned core behavior, deployed configuration, signed event handling, duplicate/out-of-order delivery and original-outcome recovery against the selected integrations.
- **Readiness:** implementation tests, provider sandbox proof, independent lender acceptance and an explicitly authorised live pilot are distinct evidence stages. No percentage of a commercial banking suite or completion estimate is asserted.
