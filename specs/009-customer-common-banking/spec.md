# Persistent customer directory and common banking

## Outcome and ownership

Finacle7 / Beads `of-9hc.17` adds an approximately 100-person synthetic
directory, explicit existing-customer selection and durable within-branch
savings transfers. Fineract remains the source of balances and statements.
Finacle4 owns release, remote migrations, provisioning and live Core proof.
This branch must not merge, deploy or provision the live service.

## Registry contract

`customers` is the single registry for seed and onboarding. Each entry has a
stable `id`, `branch_id`, unique `bank_id`, `reference`, `display_name`, unique
`client_id`, unique `account_id`, `account_no`, `origin` and `status`.
`branch_id` is the existing ready scenario bank; `bank_id` is the existing
application's customer partition, not a new Core bank. Additional scope rows
reference the branch recipient/employer; only one client and savings account
are provisioned for each additional person. Existing scenario IDs and all
their products/cases remain intact. Onboarding registers its own completed
scope through the same application boundary. Duplicate ownership fails closed.

Server sessions bind to a registered scope. Selection rotates the session and
revokes the old token. A stale request includes its expected scope and is
rejected after switching. UI customer subtrees remount on scope change. Demo
directory projections disclose only synthetic name/reference/account suffix;
there is no default selection and no directory outside demo mode.

## Money and recovery

Recipient IDs resolve through active registry membership in the sender branch.
The review saves exact integer paise, source/destination ownership, date and a
short-lived offer. Confirmation uses a command and its existing Core write
claim. One original operation may dispatch once; retries only inspect it.
Retail transfers remain self-service; teller deposit/withdrawal approvals stay
unchanged. Current Core availability, active status, INR and fee/overdraft
policy are checked before dispatch. Confirmation requires matching sender
withdrawal, recipient deposit and full Core transfer receipt. Both snapshots
are invalidated. Missing proof remains uncertain and blocks later debits.

Seeding saves a deterministic 100-person manifest, stage, command key and
original outcome before each write. Status and bounded resume never reset
balances, overwrite legacy rows or retry an executing/uncertain operation.
Read-only inspection can advance only on positive original external identity,
ownership, state and funding-receipt proof. Absence never proves a safe retry.
All funds and names are synthetic demonstration data.

## Verification

Migration 0016 is additive and rehearsed locally. Tests cover distinct account
ownership, scope isolation, explicit selection, switch/reload, exact money,
both transfer legs, idempotency/concurrency, insufficient funds, proof mismatch,
ambiguous outcomes and repeated/interrupted seeding. Browser fixture proof
covers keyboard, mobile and 200% zoom. Run the exact branch full `bun run check`
with the assigned Docker socket; direct diff review precedes the private PR.
