# Live verification

## 17 October 2026 continuation

Service-centre release `257f0e7` (private PRs 18–27) added 24 request-led forms and persisted customer/staff case, information, approval and delivery histories. Its exact-source gate passed 69 tests and nine fixture browser checks. Two live synthetic cases retained their four- and seven-event histories after reload; displayed receipt search and entry at 1790 ms were verified. This is service coverage, not complete product effects or reference parity.

Card backend PR 28 adds explicitly synthetic D1 card controls and immutable history, with no Fineract/network effects. The continuation gate passes 77 tests; ten production-export fixture browser checks cover review/edit, lost-response recovery, shared staff enquiry, permanent-block confirmation and existing workspace journeys. Card migration/deployment and live card verification are still pending at this checkpoint. Individual card forms remain inferred, and broader cards, deposits, loans, payments, investments, insurance and branch/reference coverage remain open.

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
