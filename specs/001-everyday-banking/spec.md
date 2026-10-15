# Everyday banking demonstration

Date: 2026-10-15. Branch: feat/everyday-banking. Beads: of-mtw.

## Purpose

Build a private-source, publicly demoable banking sandbox. A visitor follows a synthetic customer from document submission through account approval, cash deposit, beneficiary activation, transfers, salary receipt, and statements. Staff handles reviews, cash operations, approvals, exceptions and audit.

## Actors and state

Each browser starts an isolated demonstration bank workspace. Explicit persona switching is a demo feature, not production authentication. Personas: customer, staff maker, checker. Customer access is restricted to their mapped client/account. Staff can operate only inside that demo workspace. Reopening with the session cookie retains state.

Onboarding: draft -> submitted -> needs_changes | approved -> account_active. Maker cannot approve their own request. Financial operations: prepared -> executing -> posted | failed | uncertain. Posted transactions are reversed through Fineract, never edited. Beneficiary: pending -> active | disabled.

## Acceptance scenarios

1. A visitor starts a workspace, sees real core-backed account balances and a chronological activity feed.
2. Customer submits synthetic documents and account details. Staff reviews, checker approves, and a real Fineract savings account is created and activated.
3. Staff records a cash deposit; customer balance and statement reflect exactly one posting.
4. Customer adds a beneficiary, confirms the simulated verification, transfers to another real account, and both balances reconcile.
5. Staff processes a salary from a funded demonstration employer account. It debits the employer and credits the customer once.
6. Repeated commands with the same idempotency key do not post twice. Insufficient funds and frozen accounts reject without partial UI success.
7. Staff can review approvals, place/release an account restriction, inspect audit and reverse supported posted transactions.
8. Statements are derived from core transactions and downloadable. Documents remain workspace scoped.

## Scope

First implement this everyday journey. Extend with fixed deposits, loan applications, cheque/service requests, product reference and operational dashboards as feasible after the core journey passes. Never label a placeholder as a functioning banking capability. External KYC, OTP delivery and payment rails are simulation boundaries; financial effects use Fineract.

## Verification

Typecheck, lint, architecture boundaries, unit/integration tests and a headless browser journey. Exercise live deployed core, custom domain HTTPS, persistence, duplicate requests, role checks, both transfer legs and statements. All source is private under senguttuvang/OpenFinacle.
