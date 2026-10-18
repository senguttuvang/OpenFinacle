# Customer registry integration and operator verification

## Delivery boundary

Migration 0016 is reserved for this change. It adds six tables, fourteen
customer ownership/recovery triggers and a future-profile baseline update.
The protected workflow backup verifier accepts the complete group or its
absence, rejects partial groups, and retains the existing repayment/planning
checks. No migration or seed is applied remotely by this branch.

Planning 0015 and its portal remain intact. Onboarding 0017 consumes
`createApplicantScope`, `assertApplicantScope` and `registerOpenedCustomer`
from `src/application/customer-registry.ts`. Applicant drafts bind to the
original session hash; after registration, a selected active customer's own
server session may access its retained receipt. Opening registration changes
that applicant's journey to existing. HTTP dashboard projections expose
`bank.applicant` and a minimal synthetic customer projection.

All shared frontend requests capture `X-Customer-Scope`; the server session
remains authoritative and rejects stale headers. Switching revokes the old
token and remounts the workspace. Standalone planning first binds its verified
server context. Standalone onboarding must do the same. Existing-customer
entry always requires an explicit registered ID; it never provisions accounts.
The picker searches bounded workflow metadata, omits balances, and does not
read 100 Core accounts. Selected views use their prepared cache, refreshing
from Core when invalidated by a transfer.

## Native seed operation

Run only from the clean, reviewed source matching the released revision.
The owning origin and health revision are verified before the protected
administrative credential file is read. Redirects are rejected. There is no
raw Core or storage bypass. The coordinator owns live execution after release
and a protected backup. Names and INR funding are entirely synthetic.

The directory target is 100: one unchanged legacy customer and 99 new owned
client/savings pairs. `prepare` persists the manifest; it never funds accounts.
Each stage saves its original key before dispatch. Receipt keys are bounded
to 41 characters. `run` sequences known-success progress through bounded HTTP
requests; `resume` advances one explicit range. Neither retries an unresolved
original. `inspect` is read-only against Core and advances only with positive
ownership/state/receipt evidence; absence leaves the stage blocked.

Examples below use a placeholder path to an owned mode-600 secrets file:

```bash
bun run cli customers --url https://openfinacle.plts.in --secrets-file /protected/operator.vars --branch-id ORIGINAL_BRANCH --action status
bun run cli customers --url https://openfinacle.plts.in --secrets-file /protected/operator.vars --branch-id ORIGINAL_BRANCH --action run --stage-budget 10 --customer-budget 2 --max-stages 1 --seconds-budget 300
bun run cli customers --url https://openfinacle.plts.in --secrets-file /protected/operator.vars --branch-id ORIGINAL_BRANCH --action run --stage-budget 495 --customer-budget 99 --max-stages 5 --seconds-budget 3600
bun run cli customers --url https://openfinacle.plts.in --secrets-file /protected/operator.vars --branch-id ORIGINAL_BRANCH --action inspect --customer-id ORIGINAL_SAMPLE_ID
```

Overall budgets are explicit: 1–495 financial/provisioning stages, 1–99
customers and 1–7200 seconds. Each HTTP request advances at most 1–5 stages
(default 1) and has a 120-second timeout. Source verification has a 10-second
timeout. Any timeout stops for original-stage inspection. An in-flight request
may finish its already authorized per-request stages; the CLI sends no further
request after timeout. The report records
advanced stages, completed customers, progress request count and completion.

The complete fresh seed sends 495 Core writes. The current positive-proof
adapter performs approximately 2,475 Core requests across those customers,
plus legacy registration reads. At 0.1–1 second per Core request this is
roughly 4–42 minutes before overhead; this is an estimate, not measured live
performance. Start with two customers and inspect observed latency. Completed
reruns send no Core writes and preserve changed balances and all existing data.

## Verification contract

`bun run check` is the full branch gate, with
`DOCKER_HOST=unix:///Users/SenG/.colima/upwork-v2/docker.sock`. Owned tests use
the real workflow SQL/application/adapters against a deterministic Core
fixture: 100 distinct registered customers, interrupted stages, disk reopen,
exact money, both statement legs, receipt tampering, concurrent confirmations,
cash/loan claim compatibility, stale scopes and source-bound bounded CLI runs.
These are local integration tests, not proof that a live Core has been seeded.

Browser fixtures cover explicit keyboard selection, review before posting,
one confirmation, recipient credit/sender debit after switching and reload,
390/720px layouts with 200% text, and standalone shared-planning scope binding.
The full existing workspace browser suite remains a regression gate.
Finacle5 owns the eventual integrated real-Core/browser proof, including
teller-approved cash on customer A, retail transfer A to B and both statements.
