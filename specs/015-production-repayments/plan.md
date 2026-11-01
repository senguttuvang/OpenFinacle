# Production Repayment Delivery Plan

This plan sequences the recommended existing-loan repayment workflow, connects each gate to Beads and defines what evidence advances it. It is a future delivery plan; this change only captures scope. The [specification](spec.md) owns financial behavior and acceptance.

## Execution And Existing Work

- **Production epic:** `of-1m2.19`; portfolio `of-1m2`.
  - **Historical savings-funded pilot:** `of-9hc.15.12` is related reusable work, not the external-funded production contract and not an artificial prerequisite to finishing all old demo scope.
  - **Current capture task:** `of-1m2.1` owns documentation and traceability only. No production implementation ticket is claimed by this capture.
  - **Canonical work:** Beads stores live status/dependencies; the list below is a stable contract map, not a second checkbox ledger.

## Delivery Gates

### D01

- **Approve lender, loan product, collection flow and operating contract** — `of-1m2.19.1`.
  - **Depends on:** no predecessor; resolves the institutional decisions that gate implementation.
  - **Acceptance:** Named lender and accountable product/finance/risk/operations owners approve permitted collection path, product rules, non-final instalment eligibility, payment limits, posting trigger, value date, return/dispute treatment and launch obligations. Name the verified eligible portfolio and provider contract. No missing decision is filled by a demo default.

### D02

- **Prove core repayment and external funding accounting contract** — `of-1m2.19.2`.
  - **Depends on:** `D01` (`of-1m2.19.1`).
  - **Acceptance:** Pinned Fineract source/API and a configured test institution prove external-funded repayment, account mapping, exact allocation, original identity, reversal and recovery. Do not use the savings-to-loan transfer port for already collected external funds. Reconcile gross payments, provider fees, clearing and bank settlement with approved journals; independently verify opening balances.

### D03

- **Deliver production identity, ownership and privacy controls** — `of-1m2.19.3`.
  - **Depends on:** `D01` (`of-1m2.19.1`).
  - **Acceptance:** Real borrower/staff IAM, MFA/risk-based confirmation, consent, account binding, tenant/loan ownership, least privilege, audit and retention policies pass cross-customer and cross-institution negative acceptance. No persona switching or demo confirmation is used.

### D04

- **Integrate one approved collection provider and settlement feed** — `of-1m2.19.4`.
  - **Depends on:** `D01` (`of-1m2.19.1`), `D02` (`of-1m2.19.2`).
  - **Acceptance:** Signed/versioned webhooks, original-body verification, independent payment lookup, durable event ingestion, duplicate/out-of-order processing and settlement statements are proven in provider sandbox. Bind lender, payer, loan, amount, currency and original attempt; handle key rotation and unavailable providers. Provider is not selected by this planning ticket.

### D05

- **Implement durable repayment intents and original-outcome recovery** — `of-1m2.19.5`.
  - **Depends on:** `D02` (`of-1m2.19.2`).
  - **Acceptance:** Reserve immutable intent, consent, amount, original references and ownership before side effects. Separate collection, core-posting and settlement states; deliver inbox/outbox with idempotent consumers. Lost reservation acknowledgement sends no write; uncertain outcomes require original verification, never blind re-collection or duplicate core posting.

### D06

- **Post one externally funded repayment to the authoritative core** — `of-1m2.19.6`.
  - **Depends on:** `D02` (`of-1m2.19.2`), `D04` (`of-1m2.19.4`), `D05` (`of-1m2.19.5`).
  - **Acceptance:** Authoritative accepted-funds evidence triggers one supported loan posting with immutable original correlation and lender-approved value date. Exact principal/interest/fee allocation is core-owned. Stale reads, lost replies, simultaneous payments and callback redelivery cannot double-post, double-debit or fabricate success. A separate actual duplicate collection is an exception, not silently discarded.

### D07

- **Reconcile collection, loan posting, bank settlement and GL** — `of-1m2.19.7`.
  - **Depends on:** `D04` (`of-1m2.19.4`), `D06` (`of-1m2.19.6`).
  - **Acceptance:** Independent scheduled/event reconciliation matches original payment and loan transactions, provider settlement and approved GL entries including gross/net fee treatment. Partial, missing, reversed, excess and orphan funds have durable exceptions, alerts, ageing, ownership and resolution evidence; no balance-delta-only confirmation.

### D08

- **Deliver borrower review, status, receipt and loan statement** — `of-1m2.19.8`.
  - **Depends on:** `D03` (`of-1m2.19.3`), `D05` (`of-1m2.19.5`), `D06` (`of-1m2.19.6`).
  - **Acceptance:** Borrower sees owned due amount, review/consent, pending/confirmed/failed states, immutable receipt, statement and support reference. Reload and lost browser replies recover the same original. Accessible keyboard/mobile journeys distinguish payment accepted, loan posted and settlement reconciled; no implied full-loan lifecycle.

### D09

- **Operate exceptions, returns, reversals and customer support** — `of-1m2.19.9`.
  - **Depends on:** `D03` (`of-1m2.19.3`), `D07` (`of-1m2.19.7`).
  - **Acceptance:** Authorised staff handle held/unallocated funds, returns/refunds/disputes, duplicate actual collections, delayed success and reversals using reasons and independent approvals where policy requires. Preserve original money and audit records; compensate instead of deleting, expose customer outcomes and rehearse escalation.

### D10

- **Pass independent security, load and disaster-recovery acceptance** — `of-1m2.19.10`.
  - **Depends on:** `D03` (`of-1m2.19.3`), `D04` (`of-1m2.19.4`), `D05` (`of-1m2.19.5`), `D06` (`of-1m2.19.6`), `D09` (`of-1m2.19.9`).
  - **Acceptance:** Agreed numeric SLO/load envelope and RTO/RPO pass on production-like isolated infrastructure. Independent security assessment, secret/data controls, restore/replay/failover, controlled release rollback, monitoring and on-call drills pass with pending financial operations preserved.

### D11

- **Obtain lender financial UAT and operational launch acceptance** — `of-1m2.19.11`.
  - **Depends on:** `D07` (`of-1m2.19.7`), `D08` (`of-1m2.19.8`), `D09` (`of-1m2.19.9`), `D10` (`of-1m2.19.10`).
  - **Acceptance:** Lender finance verifies journals/allocation/value dates and reconciled datasets; risk/compliance/security/operations accept applicable controls, provider contracts, retention and support evidence. Adversarial acceptance matrix passes. All external blockers are resolved and an independently signed pilot exit/stop plan exists.

### D12

- **Execute an expressly authorised bounded live repayment pilot** — `of-1m2.19.12`.
  - **Depends on:** `D11` (`of-1m2.19.11`).
  - **Acceptance:** Only after explicit live-money authority: execute permitted transactions within agreed exposure/cohort limits, verify independent core/provider/settlement/GL proof, rehearse incidents and measure service objectives. Stop collection on unsafe ambiguity; preserve investigation and restrict ongoing servicing if new collections pause. Software test success alone cannot close this gate.

## Verification And Release

- **Financial correctness:** map specification A01–A10 to meaningful core/provider/reconciliation integration and failure-injection tests; obtain independent finance evidence.
  - **Durability:** crash at every side-effect boundary, deliver duplicate/out-of-order events and restore pending operations without repeating unknown financial actions.
  - **Experience:** A11 covers accessible borrower and authorised staff journeys; preserve all existing demo behavior through isolated fixtures.
  - **Operations:** A12 proves measured service/recovery objectives, independent lender UAT and owned operational handoff.
- **Repository delivery:** isolated worktree, direct self-review, `bun run static:architecture`, exact-branch `bun run check` and relevant isolated browser/integration suites before the normal PR/merge path.
  - **Runtime changes:** source-bound backup/restore proof, additive migrations, controlled cutover and rollback that retains pending/confirmed financial records.
  - **Live gate:** D12 remains prohibited until explicit pilot authority, provider/lender agreements and D11 acceptance are present. No sandbox-only result closes D12.
- **Unknowns:** lender, provider/rail, existing portfolio import, exact accounting and value-date rules, service envelope, RTO/RPO, operating team and applicable assurance.
  - **Decision owner:** D01 names the accountable institution owners and assigns unresolved decisions; D02 verifies technical/financial core fit.
  - **No fabricated estimate:** size the selected implementation after these contracts are known.
