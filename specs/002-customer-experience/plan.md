# Customer portal implementation plan

Public-reference research replaces the unavailable authenticated review at the owner's request (2026-10-16). Execution: Beads `of-djb`.

## Design and evidence

ICICI's official [dashboard demo](https://www.icici.bank.in/personal-banking/iplay/internet-banking-dashboard) describes account details, recent transactions and services. Its public video metadata dates that dashboard demo to 2020-10-22: this is a historical reference, not proof of the current authenticated UI. The [services catalogue](https://www.icici.bank.in/personal-banking/ways-to-bank/net-banking/online-services) confirms dashboard, accounts, statements, payments, profile and service categories.

Visually inspected the bank-hosted historical image [getting-started-step2.png](https://www.icicibank.com/content/dam/icicibank/getting-started-step2.png) and a public [Tax2win walkthrough screenshot](https://emailer.tax2win.in/assets/guides/e-verify/Icici-tax-centre.jpg). The latter is secondary visual evidence only. Patterns: full-width header and horizontal product navigation; left service shortcuts; central savings portfolio with orange action strip; recent activity; right service/product panels; burgundy/orange accents on pale gray and white surfaces.

Raw reference images remain outside the repository. Recreate structural patterns with OpenFinacle identity and synthetic data; do not embed the bank's logo, screenshot, offers or customer details. The official video download was unavailable (YouTube returned a sign-in/bot check). The public 2025 refresh forum was inaccessible (403). Do not claim pixel parity with the current 2026 portal.

## Implementation boundaries

1. Extend workspace creation with `new` / `existing` journey selection; preserve the existing no-body API default. Resume a valid current session without recreating or refunding its workspace.
2. Add a forward-compatible D1 journey column. Initialize an existing-customer workspace through supported Fineract account lifecycle and real deposits/transfers/withdrawals. Sample activity is posted on today's business date and labelled accordingly, not presented as invented historical months. Mark an interrupted setup exceptional and never replay that workspace automatically.
3. Add an existing-customer presentation component: portfolio balance, account details, statement/transfer actions, recent core activity and service shortcuts. Retain the new-applicant experience and staff controls. Reuse financial commands rather than create parallel posting paths.
4. Use responsive horizontal navigation, a service sidebar and orange/burgundy theme for the existing-customer view. Every enabled action navigates to a working capability. Unsupported investments/cards/payment rails are not portrayed as funded products.

## Verification and release

Behavioral tests cover both initial states, setup failure and financial request contracts. Live E2E covers existing-account seed balance and both transfer legs, resumed-session idempotency, statement download, service-request handling, reload, mobile overflow and the original onboarding-to-salary journey. Run the full repository check, self-review, GitHub PR/CI/merge and repository deployment CLI; verify exact revision on the custom domain. No change to real bank accounts or external rails.
