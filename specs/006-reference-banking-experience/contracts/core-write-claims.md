# Shared Core write reservations

Execution: `of-9hc.15.7`. This provides account-level arbitration for existing savings commands and future lending operations. It does not expose a loan write or establish completion of the lending journey.

## Authority and scope

Fineract owns postings and balances. D1 stores durable workflow reservations and immutable observed outcomes, never a financial ledger. Use the existing Store/Core/Effect boundaries without another coordinator, lock service, lease or cloud resource. Future loan operations must bind their own authorized original operation to this reservation in the same database statement or transaction before Core dispatch. Their payload, consent, maker/checker, correlation and reconciliation contracts remain separate requirements.

At most one executing or uncertain owner may reserve a bank's owned savings account. The unique partial index is the final arbiter even when both callers previously read an unreserved account. SQLite triggers create a command's reservation and initial history atomically when its status becomes executing. They also protect the prior Worker's command SQL during application rollback. New pending cash instructions and execution reject unresolved loan or command reservations; another workspace remains independent.

Reservations retain kind, original owner ID, bank/account, origin, initial observation time and version. Outcomes append history atomically. Executing may become uncertain, confirmed or definitely failed; uncertain may only become confirmed after its owner's explicit corroboration. There is no timed expiry, deletion, reset, failed-from-uncertain transition or automatic retry. Definite failure and confirmed completion release account exclusivity while keeping history. Original command identity, amount, payload and authorization cannot change after reservation. Failed history persistence leaves the original instruction and reservation unresolved together.

## Migration and rollback

Migration 0012 records only currently executing/uncertain legacy commands, with origin `legacy` and a new observation timestamp. It does not invent histories for older successes or failures. Conflicting unresolved originals on the same account, invalid ownership or an unready relationship reject the migration; no owner is discarded or repaired. Strict native SQLite rehearsal must reject any interior backfill failure even if later SQL is valid. Apply only through the protected release CLI with a fresh exact-source verified backup; do not inspect or modify production through a second database path.

Preserve this additive schema on application rollback. The SQL guards continue excluding incompatible writes by older Workers. Do not delete reservations, undo financial postings or restore data as an automatic rollback step. A reservation outcome alone is never evidence for a loan posting; the future owner must first establish its Core result under the lending contract.

## Verification

Test existing cash/transfer behavior and independent approval, both reservation race orders, a loan winning between pre-read and SQL write, reservation/history durability before Core dispatch, uncertain results blocking later work, definite rejection releasing only its owner, immutable histories and original authorization, workspace ownership and failed outcome persistence. Rehearse the full schema and conflicting legacy backfill using the strict native verifier. Exact-source full checks, protected migration, deployment/readiness and saved scenario retention are required before calling this gate live. No fabricated live loan reservation is needed to prove local exclusion, and this slice must not initiate a loan or financial posting.
