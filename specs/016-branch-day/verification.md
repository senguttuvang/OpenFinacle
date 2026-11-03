# Branch-day review evidence

## Implemented boundary

Six connected views use a branch membership check over the registered customer directory.
Account enquiry reads Fineract live and validates ownership, currency and numeric evidence.
Cash, restrictions, approvals and supported deposit/withdrawal reversals delegate to existing
command services; no alternate posting or ledger is introduced. Responsibilities are
versioned workflow labels in migration 0019, never an authority grant.

Accounting reads `glaccounts`, the selected savings product and
`journalentries?savingsId=<owned-account>&limit=200&offset=0&transactionDetails=true`.
Response schemas are validated. Foreign or unidentified subledger rows are withheld.
An operation link requires savings entity/account identity plus the explicit
`transactionDetails.transactionId`; no amount matching or guessed reference prefix is used.

API shape references, checked against Apache sources:
- [Journal enquiry](https://fineract.apache.org/docs/legacy/#journalentries_list).
- [Fineract 1.15 JournalEntryData](https://github.com/apache/fineract/blob/1.15.0/fineract-accounting/src/main/java/org/apache/fineract/accounting/journalentry/data/JournalEntryData.java).
- [Fineract 1.15 TransactionDetailData](https://github.com/apache/fineract/blob/1.15.0/fineract-accounting/src/main/java/org/apache/fineract/accounting/journalentry/data/TransactionDetailData.java).

## Verification commands

Run in this feature worktree:

```sh
bun run check
BASE_URL=http://localhost:3059 bunx playwright test e2e/branch-operations e2e/customers --project=workspace --reporter=list --timeout=30000
bunx playwright test --config e2e/branch-operations/review.config.ts
```

The branch tests cover multiple customers, original-key repeat, independent decision
roles, inaccessible relationship/command scopes, competing owner updates, core failure,
non-INR/incomplete evidence, reversed/other-day activity, malformed responses, account-filtered
journal shapes and foreign-subledger withholding. Existing recovery/concurrency tests
remain part of the full repository suite. Browser journeys cover search, account selection,
approval restrictions, accounting, owner assignment, keyboard, desktop/mobile reflow and
existing customer/payee/profile/transfer recovery. The separate local preview test proves
that a financial instruction is rejected rather than saved.

## Where to review

```sh
bunx wrangler dev --config config/previews/branch-day.wrangler.jsonc --ip 127.0.0.1 --port 3060
```

Open http://127.0.0.1:3060/. This is an explicitly labelled, read-only static fixture.
Its invented values are visual review material, not Fineract or settlement evidence.
It rejects all writes and non-loopback hosts. No cloud deployment is required.

## Remaining acceptance limits

- Live Fineract compatibility/accounting acceptance is not established by local test doubles.
- Application branch membership is distinct from a core account-owning office. Originating
  office is returned per journal, never inferred from the servicing branch label.
- The day filter uses the application IST date. Core business-date/COB agreement is unverified.
- Savings totals cover at most 100 registered relationships, not all bank accounts or advances.
  Journal enquiry exposes its first-200-row limit; audit history exposes its latest-100 limit.
- Legal entity classification, mandates, signatories, nominees and verified documents are absent.
  The directory can show business names without implying a verified business relationship.
- Consolidated loans, fixed/recurring deposit totals and full fee/product terms are not loaded.
- Teller/vault physical counts, handover, external statement matching, settlement reconciliation,
  formal close and core processing completion remain unavailable. Close readiness stays blocked.
- Manager/accountant/teller/checker viewpoints are navigation aids. Officer/approver are existing
  demo roles over a technical core principal, not independent production staff identities.

Migration is additive; do not deploy the new branch API against a database missing 0019.
Rollback application code through the normal release path; retain the responsibility table
rather than deleting workflow history. No deployment or production-readiness claim is made.
