# Persistent Core loan origination pilot

Execution: `of-9hc.15.9`; parent [lending contract](loans.md). This implements durable orchestration and a protected operator demonstration. Normal customer write routes and lending screens remain a subsequent slice after running-engine proof. Fixture success alone is not real loan, disbursement or reference-bank parity evidence.

## Persistence and authority

Migration0013 adds immutable owned quotes, accepted applications, append-only events, durable original Core operations and saved normalized Core views. Quote IDs bind owner/product/terms/schedule and their original time/date. Only one unfunded application may exist per relationship, a quote may be accepted once and a Core loan ID belongs to one application. Completed applications/history remain; no reset or fabricated past event exists.

Fineract remains the owner of portfolio state, schedules, balances, transactions and transfers. Saved views are timestamped Fineract observations, with a five-minute age warning and explicit refresh. D1 does not calculate loan interest or maintain balances. Missing or incompatible Core data never falls back to a simulated loan.

Customer acceptance is explicit and server-timed. Existing domain rules control recommendation, independent authorization, current-day funding and separate withdrawal steps. SQL independently guards actor, ownership, versions, source state, original input and monotonic event times. The event insert applies its matching application state and audit atomically. Quoting and ordinary decisions do not post financial transactions.

## Original Core operation protocol

A single reservation statement creates the original operation, stable global Core key, external identities, initial event and the account's shared `core_write_claims` reservation. The final unique index arbitrates loan/cash races, including older Worker cash SQL. A lost reservation acknowledgement sends no Core request. Existing orphan loan claims reject migration; none are deleted or adopted automatically.

Executing may become uncertain, confirmed or definitely failed. Uncertain may only become confirmed by positive original proof. An outcome statement atomically preserves the matching common-claim outcome/history, loan event/application transition and normalized Core observation. Wrong IDs, payloads, actors, bank/account, times, versions or proof fields reject the entire statement. Failed history/cache persistence leaves the operation unresolved. No lease, expiry, deletion or absence-based retry exists.

An old client key binds its original role and canonical request. It reads recorded status without another dispatch, even after quote expiry. Key recovery includes that key's original operation separately from the application's latest operation; later success never rewrites an earlier failure. Other roles can inspect saved owned receipts. Only an approver invokes explicit Core outcome inspection, preserving the original authorization role; an absent result remains unresolved and blocks further mutations. Saved list/detail/key reads never call Core.

Disbursement confirmation requires the existing owned external-transaction/full-transfer proof and exact accepted normalized schedule. SQL additionally correlates the one unreversed normalized disbursement and transfer to the original operation's identifiers, date and full principal. Balance increases alone never establish this proof.

The disbursement reservation invalidates the savings saved view before dispatch. Any balance read while that original operation remains executing/uncertain stays marked stale, including a read that sees a credit. Confirmed posting invalidates the view again, then explicitly refreshes it. Refresh failure leaves a confirmed active loan and stale savings view; it never becomes a failed loan or another POST. Refresh responses read persisted freshness back so an older/concurrent read cannot claim successful synchronization.

## Protected native pilot

`POST /api/admin/demo/loans/pilot` requires the existing administrator credential, same-origin rules, demo mode and strict command schemas. It selects only the already prepared permanent existing demonstration relationship. It never provisions accounts or accepts a caller-selected bank/client/account. Explicit simulated customer/officer/approver roles use the same domain and operation services. Application origin `admin-pilot` distinguishes operator demonstration from direct customer acceptance.

The CLI reuses owning-checkout, protected-token, exact-origin, source-revision and redirect guards with setup administration. Health/source verification precedes reading a credential file. One invocation executes one named action, never a command loop or automatic retry. Output contains selected synthetic quote/receipt/Core-proof metadata; it omits raw payloads, notes, transport causes, credentials and personal budget fields.

```sh
bun run cli loan-pilot --action quote --role customer
bun run cli loan-pilot --action submit --role customer --quote-id <quote-id> --accept-quote --key <new-original-key>
bun run cli loan-pilot --action recommend --role officer --loan-id <loan-id> --loan-version <saved-version> --key <new-original-key>
bun run cli loan-pilot --action register --role approver --loan-id <loan-id> --loan-version <saved-version> --key <new-original-key>
bun run cli loan-pilot --action approve --role approver --loan-id <loan-id> --loan-version <saved-version> --key <new-original-key>
bun run cli loan-pilot --action disburse --role approver --loan-id <loan-id> --loan-version <saved-version> --key <new-original-key>
bun run cli loan-pilot --action status --key <same-original-key>
bun run cli loan-pilot --action inspect --role approver --loan-id <loan-id>
```

Each step uses the ID/version printed by the preceding saved result. Generate and retain the original key before sending; never infer a latest target. After a lost or unreadable result use status by that key and explicit approver inspection, never another write because a read is absent. An explicit fresh attempt is permitted only after a definite saved failure and valid current terms. Quote preview uses independently invented ₹12,000/12-month education terms; it is not a loan submission. `--accept-quote` explicitly records simulated customer acceptance.

Explicit approver inspection includes allowlisted `inspection_checks` when proof cannot be verified. Codes identify the failed shape, ownership, schedule or correlation stage without raw Core values, parser messages, response bodies or transport causes. They are current read-only observations, not a stored outcome or authority to release/replay the original operation. Saved status still reads only D1; ordinary customer receipts do not invoke diagnosis.

For an unfunded registered/approved loan, the customer uses `request_withdrawal`. An approved loan then needs one approver `undo_approval` action followed by a later explicit `withdraw`; a registered loan needs only the latter after customer intent. Use current saved versions and new keys for these distinct reviewed stages. No active-loan reversal is implemented.

## Release proof still required

Run strict native full-schema/orphan rehearsal, persistence/application/HTTP/CLI checks, races, lost acknowledgements, rejected/ambiguous outcomes, role/ownership/date/consent and stale-view cases. Complete direct review, exact-source full local gate, private PR/main CI, fresh exact-source protected backup and migration0013 within thirty minutes, then deployment. Preserve the additive schema on rollback.

Before normal customer write routes/screens, perform the actual protected synthetic quote/application/recommendation/registration/approval/savings-disbursement pilot. Verify Core transaction/transfer/schedule, exact savings delta, immutable event/role history, original-key read-only recovery, both unfunded withdrawal paths, readiness and saved journey retention. Do not induce ambiguous live financial writes, reset shared scenarios or reverse a confirmed posting to tidy a test. Record actual outcomes separately from these requirements; repayments and fuller servicing remain later work.
