# Finacle capability interpretation

The supplied UpNote export contains four Markdown notes: overlapping Finacle command catalogues, an operational walkthrough, and a saved product overview. Their metadata dates are 23 November 2025. Menu names are evidence of capability families; they do not specify proprietary validation rules, data models, accounting conventions, or screen behavior. OpenFinacle provides an original implementation of selected banking workflows.

## Demonstrated journey

- **Customer records and account opening:** synthetic identity/address documents, application review, separate recommendation and approval, then a real Fineract client and activated savings account.
- **Teller cash:** an officer prepares a deposit or withdrawal; an approver authorizes the Fineract posting. Corrections use a reversal and preserve transaction history.
- **Beneficiaries and payments:** customer-owned beneficiary records, an explicitly displayed demo confirmation code, and internal savings-account transfers. The core debits the sender and credits the recipient together.
- **Salary receipt:** an approved internal transfer debits the employer's funded account and credits the customer's account.
- **Account inquiry and statements:** live account balances, core transaction references, transaction history and CSV export.
- **Restrictions and operations:** approved debit restrictions and release, three-party balance inquiry, command status and an application audit trail.
- **Customer servicing:** chequebook, debit-card and address-change request queues, with explicitly simulated fulfillment.

These workflows compose Fineract APIs with channel-specific application state. Fineract owns account lifecycle, financial transactions and configured savings accounting. D1 owns the application, approvals, beneficiaries, requests and originating demo-role audit. R2 owns private document objects.

## Capabilities available for subsequent product workflows

Fineract's source contains APIs and domain modules for savings interest and charges, fixed and recurring deposits, loans and repayment schedules, accounting, offices, staff, permissions, reports and scheduled processing. Their presence in the engine does not mean OpenFinacle has implemented or verified the corresponding customer/staff experience.

Useful next vertical slices are a fixed-deposit placement/maturity journey, a personal-loan application/disbursement/repayment journey, and a branch accounting/reporting workspace. Each needs its own product configuration, approval rules, complete financial lifecycle and integration tests. A menu or an application-request row alone is insufficient proof.

## Separate integration work

The exported catalogues also describe payment networks, clearing, foreign exchange, trade finance, treasury, interbranch operations and specialized deposit/reporting functions. Those require separate capability evaluation. External payments need a settlement adapter and reconciliation; identity verification needs an actual KYC provider; physical cards/cheques need issuer or fulfillment integration. The demonstration has no external settlement or identity-provider connection.

## Extension boundary

Use the TypeScript/Effect application layer for onboarding, documents, role/ownership checks, channel orchestration, beneficiary policy, approval composition and presentation APIs. Use Fineract's public API for financial effects.

Change Java only for behavior that must execute inside the core's financial transaction, such as a new calculation, posting rule or core invariant that existing APIs cannot express. Keep such changes in a pinned, separately tested upstream fork. Avoid implementing a second balance or ledger in the channel API.

Next.js owns both interactive experiences. A CMS could later manage help, product descriptions or editorial content. Banking commands, ledger balances and staff authorizations stay with the banking/application services.

## Evidence

- Supplied UpNote export: `UpNote_2026-10-15_22-08-44`, four Markdown notes. Original material remains outside the repository.
- [Fineract 1.15.0 source](https://github.com/apache/fineract/tree/1.15.0), pinned commit `d5636847ac556c30b437254c353f05526d172b97`.
- [API/UI security boundary](https://github.com/apache/fineract/blob/1.15.0/SECURITY.md).
- Repository implementation: `src/application/banking.ts`, `src/http.ts`, `app/page.tsx`.
- Behavioral proof: `tests/banking.test.ts` and the deployed-system journey in `e2e/everyday.spec.ts`. Live verification results belong in the deployment evidence; source availability alone is not successful execution.
