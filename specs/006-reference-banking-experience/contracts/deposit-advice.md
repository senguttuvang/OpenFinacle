# Deposit advice enquiry and download

Evidence date: 17 October 2026. Execution: `of-9hc.13`. The bank's public [FD management guide](https://www.icici.bank.in/personal-banking/iplay/manage-your-fixed-deposit-on-internet-banking) documents downloading FD advice and an interest certificate. This supports a capability, not an observed authenticated template, field contract or staff permission. The [RD FAQ](https://www.icici.bank.in/personal-banking/deposits/recurring-deposits/recurring-deposit-faqs) identifies statement/interest-certificate enquiry; the current extraction failed, so its detailed contents are not relied on. No private bank page or personal data was captured.

## Product boundary

Implement an explicitly synthetic **opening advice** for the already persisted active FD/RD. This is a read model of immutable activation facts, not a new issuance workflow, tax/interest certificate, financial security or proof of actual funding. It must state that no savings debit, mandate, credited interest, payout or external settlement occurred. Recorded FD maturity preference remains intent only. RD advice describes planned monthly allocations and the original maturity illustration, not paid installments or accrued earnings. Current installment progress stays in the holding view.

No new schema, R2 object, dependency, ledger or background task is needed. Persistent terms and activation events are the authoritative source; enquiry never creates or changes a product. The same activation advice survives role, reload, journey and deployment. It has a stable product reference and activation version, without a fabricated issue number/signature or a fresh issue timestamp. Later RD allocations cannot rewrite this opening advice. Actual certificate issuance and maturity servicing require later contracts.

## Ownership and presentation

Customer, officer and approver may enquire within their current relationship. All requests authenticate and scope the existing product detail to the session relationship; cross-relationship or missing products return 404, submitted/recommended/rejected/cancelled products return 409. Empty/oversized/mixed identifiers and unknown product kinds fail before enquiry. Only active products with coherent activation date, maturity, independently authorized maker/checker and matching activation history qualify. Malformed persisted facts fail closed.

`GET /api/deposit-advice?kind=fixed|recurring&id=...` returns a validated JSON advice read model. `download=1` returns UTF-8 plain text with attachment disposition, no-store and nosniff. Text avoids HTML/CSV execution and preserves invented labels literally. Filename uses a sanitized product reference, never user text. No state-changing GET or automatic save occurs. Preview errors remain visible with retry available; an unverified response must not show a download action.

Holding detail offers preview only for active products. Preview checks returned relationship/product/reference against the requested holding, shows the demo boundary, original amount/term/rate/illustration, activation and maturity dates, authorization and nominee/maturity preference, then an explicit download link. It uses existing type/space/color tokens and remains usable on mobile/XL and at 200% text.

## Architecture and verification

Pure domain mapping and plain-text rendering live in `src/domain/deposit-advice.ts`; application ownership and persisted-history reads in `src/application/deposit-advice.ts`; HTTP owns request/attachment handling; the shared holding preview stays in `app/deposit-advice.tsx`. Existing Effect, Schema, Store and download conventions suffice; no commodity infrastructure is introduced. Dependency-cruiser and the full existing static gate check inward boundaries.

SQLite integration tests cover both products before/after authorization, ownership, all roles, no enquiry writes, immutability through RD allocation, invalid history and literal markup-like labels. HTTP checks cover auth, strict query fields, attachment headers and failures. Browser tests cover preview/download contents, malformed responses/error recovery and mobile/large text alongside the existing full workspace suite. The release uses direct self-review, private PR checks and live invented holdings only. Broader servicing, real interest certificates and reference parity remain open.
