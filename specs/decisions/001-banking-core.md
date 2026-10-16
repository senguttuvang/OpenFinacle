# ADR 001: Use Apache Fineract as the banking core

Status: Accepted by the project owner on 2026-10-16.

## Context and objective

OpenFinacle demonstrates credible everyday banking through synthetic customers and money. It is not a replacement for the full Finacle product or a claim of production regulatory readiness. Customer scope includes onboarding, account opening, deposits, beneficiaries, internal transfers, salary receipt and statements. Staff scope includes customer review, approvals, restrictions, reversals, operational exceptions and audit.

The demonstration must support a new applicant and an established customer. The latter should have an active, populated account and a familiar internet-banking experience without repeating account opening.

## Decision

Commit to Apache Fineract as the sole financial system of record. Retain the existing integration rather than rewrite the engine in TypeScript or introduce a second ledger. The current implementation pins Fineract 1.15.0; upgrades require separate compatibility and security assessment.

- Next.js/React owns the customer and staff presentation.
- Effect/TypeScript owns journeys, authorization, approval orchestration, beneficiaries, integration commands and exception handling.
- Fineract owns banking accounts, financial transactions, balances and configured product/accounting behaviour.
- D1 owns application workflow/session metadata; R2 holds private synthetic documents. These stores must not invent financial balances.
- Keep upstream schemas behind the core adapter. Use supported APIs and configuration first; Java changes require a demonstrated need inside the core transaction or calculation boundary.
- Payload CMS and NestJS are not required. Reconsider CMS tooling only for a concrete content-management capability.

This is an architecture commitment, not an assertion that the demo is production ready.

## Alternatives considered

### Custom TypeScript/Effect core with PostgreSQL

Benefits: direct control of the domain, one primary application language, a narrow product model and fewer inherited features. A modular monolith could keep postings and account rules within a single database transaction.

Costs: implement and validate double-entry posting, account lifecycle, concurrent spending prevention, idempotency, holds, reversals, interest, rounding, effective dates, reconciliation and financial-data migrations. Effect helps structure errors and side effects; it does not establish durable financial correctness by itself.

Disposition: not selected. Owning a new financial engine is not necessary to prove the intended customer journeys.

### Custom TypeScript banking domain with TigerBeetle

Benefits: specialized double-entry accounts/transfers, immutable records, unique transfer identities, balance constraints and pending/post/void primitives. Useful when custom ledger-backed products are the strategic objective.

Costs: still implement savings products, customer/account lifecycle, interest, fees, payment integrations, reporting and operations. Customer metadata requires a general-purpose store; recovery must address partial success across that store and TigerBeetle. Operating a specialized database does not eliminate infrastructure responsibilities or produce an all-TypeScript stack.

Disposition: not selected. It removes ledger implementation work but less banking-domain work than Fineract. Do not place it beneath or beside Fineract without a distinct requirement and an explicit authority/reconciliation model.

### Tally, ERPNext or another business accounting platform

Benefits: established general-ledger, voucher, reporting and reconciliation concepts; useful for corporate finance integration and accounting reference.

Costs: enterprise accounting models a business's receivables, payables, expenses and bank assets. A retail core models customer-deposit liabilities and individual account subledgers, plus banking lifecycles and policies. Shared double-entry principles do not provide equivalent capabilities.

Disposition: not selected as the retail banking core.

### Fineract with custom channels (selected)

Benefits: existing banking product/account machinery and accounting integration; reuse of the working adapter; more effort available for customer experience and staff workflows.

Costs: JVM operations, migrations, configuration learning, API adaptation and upgrade testing. Core reuse does not prove every behaviour correct or supply all external bank integrations. Avoid a heavily modified fork.

## Financial and operational boundaries

A customer deposit is a liability of the bank; customer account subledgers reconcile to GL control accounts. Same-bank transfers move value between customer liabilities. External transfers additionally require clearing, settlement, return handling and reconciliation. A balanced journal alone does not prove authorization or prevent a duplicated business instruction.

Use unique durable command identities and explicit prepared/executing/posted/failed/uncertain outcomes. There is no distributed transaction across application storage and Fineract. A timeout after submission must not trigger blind replay; inspect and reconcile uncertain outcomes before allowing dependent operations.

Existing demo boundaries remain explicit: synthetic documents, demo persona switching and verification codes, internal funded-account salary transfers, simulated service fulfillment, and no live external payment rails. Production work additionally requires real identity, verification/fraud controls, security hardening, recovery exercises, payment-provider integration and independent domain assurance.

## Effort discussion

The conversation's estimates were planning hypotheses, not benchmarks or commitments. For a single-country/currency product with onboarding, deposits, transfers and limited operations: a greenfield credible demo was estimated at 4–8 weeks with Fineract versus 8–16 weeks for a bounded custom core (2–4 people). Engineering readiness for a controlled real-money pilot was estimated at 9–15 months with Fineract (7–10 people) versus 18–30 months for a custom core (10–14 people).

These ranges exclude independent delays from licensing, partner onboarding and certifications, depend on experienced banking/security specialists, and do not estimate the remaining work on the already-built demo. No separate TigerBeetle schedule was established. AI-assisted coding does not remove independent validation or operational evidence requirements.

## Consequences and reconsideration

Build differentiated functionality in the TypeScript application. Validate concurrency, duplicate submissions, ambiguous outcomes, reversals, interest and reconciliation against the pinned core. A future engine change requires a separate decision including historical data, balances, accrued amounts and pending instructions; an adapter alone does not make migration cheap.

Reconsider only when a documented product requirement cannot be implemented acceptably through Fineract, or owning a new banking engine becomes an explicit strategic objective.

## Primary references

- [Fineract API and product/account capabilities](https://fineract.apache.org/docs/legacy/)
- [Fineract deployment and security responsibilities](https://fineract.apache.org/docs/stable/)
- [TigerBeetle system architecture](https://docs.tigerbeetle.com/coding/system-architecture/)
- [TigerBeetle data model](https://docs.tigerbeetle.com/coding/data-modeling/)
- [TigerBeetle pending transfers](https://docs.tigerbeetle.com/coding/two-phase-transfers/)
- [ERPNext general ledger](https://docs.frappe.io/erpnext/general-ledger)

References informed the 2026-10-16 discussion; upstream current documentation can differ from our pinned release.
