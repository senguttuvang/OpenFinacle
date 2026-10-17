# Live verification

## 17 October 2026 continuation

Fixed-deposit PRs 38–41 deployed clean source `cf9eb91febecaf41d81a080d6e2c9402947aba38` as Worker `4fb17ca6-2094-419b-857f-058364aed97d`. Exact-source health and real-core readiness passed. Live invented holding `FD-55AC7973` progressed from customer submission through officer recommendation to separate approver activation. The officer could not activate; customer reload and prepared journey switching retained the active holding and three events, with no cancellation action. Savings stayed unchanged across submission and authorization. Existing six card events and two profile snapshots were preserved.

Initial cache-disabled entry measured 3064 ms, exceeding the target; a repeat measured 1200 ms (dashboard resource 613 ms), prepared new journey 827 ms and existing journey 1314 ms. These observations do not erase the initial miss or establish a universal latency guarantee. The live controller initially stalled auto-scrolling to the journey switch; explicit scrolling followed by a normal click succeeded, and comfortable/extra-large standalone browser checks also passed the existing layout. No application CSS defect or fix was established. The extra browser coverage records the journey behavior without a financial write. Broader reconstruction and reference parity remain incomplete.

Finacle4 deposit foundation PRs 38–39 add persistent synthetic FD applications/holdings, independent officer recommendation and approver activation, immutable product terms/history and atomic audit, plus validated customer terms/review components. Full exact-source checks pass 93 tests/474 assertions, including failure rollback, competing decisions, ownership, replay, strict HTTP fields, Indian-midnight/leap-month maturity and zero core calls. The illustrative 6% simple-interest product uses demo allocation only; it never debits savings or settles externally. Migration 0009 was applied after the protected backup/restore/integrity procedure from clean source `1dc78ba`.

Workspace PR 40 adds on-demand customer/staff navigation, review/edit, persistent outcomes/history and reload-safe command reconciliation. All 16 production-export workspace browser checks passed at its source, including the customer → officer → approver → customer FD journey. Continuation verification passes 19 workspace checks, additionally covering malformed responses, confirmed-missing keys, storage failure blocking POST and inspectable pending references during list failure. Desktop, 390px extra-large and 200% text-size captures were inspected; narrow-screen deposit facts were corrected to one column to avoid splitting financial values. Live FD deployment/verification is pending at this checkpoint. Specific reference fields and staff permissions remain inferred; broader deposits and other product/branch families remain open.

Service-centre release `257f0e7` (private PRs 18–27) added 24 request-led forms and persisted customer/staff case, information, approval and delivery histories. Its exact-source gate passed 69 tests and nine fixture browser checks. Two live synthetic cases retained their four- and seven-event histories after reload; displayed receipt search and entry at 1790 ms were verified. This is service coverage, not complete product effects or reference parity.

Card PRs 28–29 add explicitly synthetic D1 card controls and immutable history, with no Fineract/network effects. The continuation gate passes 77 tests; ten production-export fixture browser checks cover review/edit, lost-response recovery, shared staff enquiry, permanent-block confirmation and existing workspace journeys. Migration 0007 was applied after an exact-source protected backup/restore check. Source `a808551` deployed as Worker `2c8b4a46-330a-46d1-a7b9-7d50556c6e88`; health and real-core readiness passed. Live synthetic settings and hold/resume changes persisted after reload. Initial post-release entry took 3694 ms, exceeding the target; repeat entry took 1454 ms. This prompted deferring the card workspace code until navigation and a presentation follow-up. Individual card forms remain inferred, and broader cards, deposits, loans, payments, investments, insurance and branch/reference coverage remain open.

Card follow-up PR 30 deployed source `74cd30c` as Worker `f7db267b-7dfc-4bb3-a48f-5302feb7389f`. Health and core readiness passed; cache-disabled entry measured 2712 ms. Six card events persisted across deployment, with the card active after customer hold/resume verification. Officers could only protectively block, and approvers had enquiry access; both saw the same held state/history. Desktop and 390-pixel mobile inspection passed without page overflow. No real bank, card network or financial core mutation occurred.

Profile backend PR 31 implements domain-selected address/email/branch/employer effects on independent case approval, atomically preserving profile snapshots, source cases and case audit. The exact-source gate passes 85 tests, including simultaneous approvals and rollback guards. The customer/staff UI replaces static contact defaults with the scoped saved profile and links history to request tracking. Twelve production-export fixture browser checks cover existing journeys plus shared profile enquiry, reload, source-case search, malformed responses and missing-profile onboarding. Migration 0008 and live profile verification remain pending at this source checkpoint; existing completed cases are not replayed.

Profile PRs 31–32 deployed source `ace5cb7` as Worker `c91b4540-422e-49cd-96e7-8432b6ff70ef` after a protected 879968-byte backup/restore check and additive migration 0008. Health and real-core readiness passed. A fictional address case progressed through officer processing and separate approver fulfilment; the officer could not complete it. The changed profile and two snapshots persisted for the customer after reload, and its source-case link opened the matching four-event case with no customer edit action. Desktop/mobile inspection passed without overflow. Cache-disabled entry measured 3219 ms, exceeding the target; execution issue `of-9hc.7` tracks the remaining entry-latency fix. This release did not mutate real-bank or core financial records.

Verified on 16 October 2026 (Asia/Kolkata) at https://openfinacle.plts.in against Apache Fineract 1.15.0. Financial application source: `3dbdd4c7c7e4084eb5a79c4a5bc2027de200ea88`. The release endpoint `/api/health` identifies the final deployed Git revision.

`bun run check` passed: strict TypeScript, Biome, Oxlint, Knip, dependency-cruiser, type coverage above 99%, 28 behavioral tests, production export, and the Wrangler/container build dry-run. Biome reports existing CSS ordering warnings; there are no check errors. Secret scanning passed. The Indian-midnight date boundary is tested with an explicit clock instant; domain formatting does not read the system clock.

`bun run test:e2e` passed against the deployed system in 5.1 minutes. It used a real headless Chromium browser and the real banking API, with no mock financial backend.

## Proven behavior

- Created isolated recipient and employer clients/accounts in Fineract, including person/company legal forms and actual cash funding.
- Uploaded two synthetic documents to private R2, submitted the customer application, recommended it as an officer and opened/activated the account as the separate approver.
- Rejected attempted officer self-approval. A pending cash instruction had no financial effect until the approver posted it.
- Verified customer balances of ₹0 → ₹10,000 → ₹7,500 → ₹92,500 after opening, deposit, transfer and salary.
- Verified the beneficiary's ₹2,500 → ₹5,000 and employer's ₹500,000 → ₹415,000 balances. Replaying the transfer key did not post again. An insufficient-funds transfer failed without changing the balance.
- Verified core transaction history and statement CSV. Reloaded persisted workflow/account state.
- Created a second browser workspace and confirmed it could neither download the first workspace's documents nor approve its commands.
- Applied a debit restriction in Fineract, confirmed a subsequent transfer was rejected, and released the restriction.
- Posted a fresh ₹1,000 cash correction and reversed it. The original transaction remained marked reversed, the customer returned to ₹92,500, and the combined three-account balance remained ₹512,500.
- Checked desktop and 390-pixel mobile layouts, no page-level horizontal overflow, and no browser JavaScript errors.

## Runtime

The Java engine runs in Cloudflare Containers. Its banking and primary tenant-registry databases persist in Railway PostgreSQL. D1 stores workflow/session records and R2 stores synthetic documents. The core reports actuator health `UP`.

The initial database build completed 1,871 Liquibase changesets. A temporary private Railway initializer completed the remaining migrations beside PostgreSQL using a separate initialization registry; its deployment was removed after completion. It has no public domain. Local diagnostic Java processes were stopped. Financial state was preserved throughout.

The Fineract container image is `sha256:72bd1c978ea2358a3f8009250f46e2a587e39a063aa3289d4e3ae552c8adb5fe`, built from the checksum-verified official binary and retaining upstream license/notices. The core sleeps after 12 idle hours; financial state persists outside its ephemeral disk.

## Screenshots

- [Welcome](screenshots/welcome-desktop.png)
- [Customer desktop](screenshots/customer-desktop.png)
- [Customer mobile](screenshots/customer-mobile.png)

## Demonstration boundaries

Persona switching is an explicit exploration control. Identity/document verification, the displayed OTP, and card/cheque/address-request fulfillment are simulated. External payment rails, full loan/fixed-deposit journeys, production identity management and automatic reconciliation are outside this delivered slice. Uncertain financial instructions require inspection and block subsequent instructions; they are not automatically replayed.
