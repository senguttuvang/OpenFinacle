# Customer saved payees

Beads `of-9hc.20`, Finacle7. Initial sample data gives each existing registered
customer 5–15 persistent saved payees. Transfers show only that customer's saved
accounts. The separate demo customer switcher continues to list the registry.
Future account holders start with an empty list and an explicit add-payee flow.

## Customer contract

Add a known internal account using its exact account number and expected account
holder name. The server resolves an active different registered account in the
same branch; it never returns a global recipient search. Review verified name
and last four digits before confirming. Names and suffixes label the shared
Radix FormSelect. Customer reference IDs remain internal. Remove archives a
stable owner/recipient relation and increments its version. A fresh reviewed add
can reactivate that same identity. Replaying a consumed add review cannot undo
a subsequent removal. A bounded demo safety ceiling of 50 active payees is
enforced atomically; it is not presented as a banking policy or the seed target.

GET `/api/customers/payees` returns `payees`, `count`, and `maximum:50` without
creating data. Each row includes opaque `id`, `recipient_id`, synthetic
`reference`, `display_name`, and `account_suffix`. POST suffixes `/review`,
`/confirm`, `/remove` accept holder name/account number, review ID, or saved
payee ID respectively. Strict request schemas reject caller-supplied ownership.
Existing demo/session/origin/customer-scope gates apply. The old recipients
route now projects this same owned list. Optional dashboard `payeeSummary`
contains count, first saved payee metadata, and the demo maximum; old fixtures
may omit it. Coordinator owns final page summary and legacy-form integration.

## Transfer authorization and recovery

Review checks active owner membership before reading Core availability. Its
immutable offer captures payee ID and version. New confirmation checks the
original offer's membership/version and repeats the check atomically when
claiming execution. Removal or re-addition invalidates older reviews. Once a
claim is authorized, later metadata removal does not cancel that original Core
instruction. Financial dispatch/proof and existing teller maker/checker remain
unchanged.

A definitive policy refusal saves the original command as terminal failed with
no dispatch and returns its bound outcome. The UI can clear only that proven
terminal original, inspect it, and begin a newly reviewed instruction. An
ambiguous transport outcome stays locked and permits inspection only. Existing
original-key inspection runs before new membership authorization, so removing a
payee cannot cause a retry or destroy historical proof. Pre-0018 offers remain
inspectable; an unconsumed old offer cannot execute without the new membership
binding. All prior beneficiaries, commands, receipts and account histories stay.

## Administrative metadata setup

Migration `0018_customer_payees.sql` adds four tables, twelve triggers and two
nullable offer columns. No Core schema, account, balance or document changes.
`payees` is a source-bound native CLI using the existing exact remote/clean
checkout, deployed revision, protected credential, target, no-redirect and
no-retry guards. The server requires admin authority and demo mode.

`prepare` freezes the current branch registry once (6–150 owners), including
already opened accounts. Deterministic ring selections assign durable targets
of 5–15. Interrupted prepare can only fill missing plans from the same roster;
resume is blocked until frozen and planned owner counts agree. `resume` processes
1–10 owners per call, at most 150 planned memberships, each atomically inserted
only while below that owner's original target. Existing additions and removal
tombstones are preserved. Inactive/invalid planned recipients block completion.
Future registry additions are excluded from that frozen setup. `status` is
read-only. Responses include frozen/planned/completed counts, preparation/setup
completion flags, active count min/max, per-call progress and at most ten owner
summaries, without full account numbers or membership dumps. HTTP calls have a
120-second ceiling and never retry automatically.

## Verification and release boundary

Exact-branch full CI, direct diff review, redacted secret scan and private PR.
Tests cover 101 frozen owners, initial range, zero-progress rerun, preserved
removals/money/documents, interrupted prepare, invalid recipients, concurrent
resume/adds, own-account scope and exact account lookup, stale review at the
claim boundary, terminal refusal, and historical uncertain transfer proof after
removal. A real CLI process pipe verifies bounded JSON and source verification
before credentials. Browser fixtures cover empty/add/review/remove, keyboard
Radix options, stale refusal/new review, original transport uncertainty,
statements after switching/reload, and mobile/200% reflow.

Finacle5 alone merges, migrates, deploys, seeds native metadata, and verifies the
live application. Finacle7 performs no live financial or production actions.
