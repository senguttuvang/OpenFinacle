# Connected branch day

Authorised scope: six connected staff screens for a small Indian bank demonstration.
Execution: of-1m2.7.1, child of OPS roadmap of-1m2.7. Reuses FND-01..10,
CUS-01/03/04/12, DEP-13, OPS-01..10, TAX-04/06; does not close production IDs.

## Contract

Use existing light workspace tokens and comfortable type. A branch/date/source strip
and a customer -> account -> instruction -> core journal -> GL trace are the signature.
Branch membership comes from the registered customer scope, never browser input.
Fineract account-owning office is separate from application servicing branch;
originating office is shown only when returned by core journals. No shadow ledger.
Read core records live; read failures remain explicit. Currency and observation time
accompany all figures. Summaries cover registered INR savings only, not total bank assets.
No fabricated advance, vault balance, journal, settlement match, or close success.

## Acceptance matrix

| Screen | Behaviour | Evidence / negative case |
| --- | --- | --- |
| Overview | Registered customer savings by product, today's account credits/debits, pending and exception links | Exclude foreign branch, reversed and other-day activity; incomplete reads block totals |
| Customers | Search individuals/business names, select relationship, read account and workflow history | Customer role forbidden; business identity/signatories/nominees/KYC explicitly unverified |
| Account | Ledger and available separately, core product/rate/restrictions/history; cash/restriction/reversal instructions | Never substitute ledger for missing available; reuse existing maker rules and idempotency |
| Transactions | Cross-customer approval inbox and original instruction, maker/checker/core reference | Checker cannot initiate; officer cannot approve; never retry uncertain posting automatically |
| Accounting | Selected account's real journals, GL chart and product mapping, originating office and operation reference | Failed/malformed/paginated evidence shown; no balanced/settled inference from arithmetic |
| Daily control | Unresolved items and durable owner assignment with optimistic version | Stale reassignment conflicts; unresolved/unknown physical cash and settlement always block close |

## Authority and limitations

Officer and approver remain existing demo personas. Teller/manager/accountant viewpoints
organise work only; they are not production IAM or independent staff identity.
Approval always uses the existing separate approver application role. Ownership is a
workflow responsibility label, not a permission grant. Preserve all customer routes.
Core API evidence: https://fineract.apache.org/docs/legacy/ (journal list savingsId,
GL list, savings product/account enquiry); deployed compatibility requires separate proof.
Test local branch isolation, ownership conflicts, unsupported evidence, dates/currency,
core read failures, role separation and existing command recovery/concurrency tests.
Browser checks cover six views, links, search, actions, keyboard and mobile overflow.

## Live-core acceptance increment

Production observation after PR116: 101 registered relationships; the previous 100-row
read excluded one and took about 41 seconds. Bulk branch-scoped workflow reads and bounded
parallel core enquiries must cover the present directory, expose capacity/coverage and
remain inside the browser request budget. No cached or arithmetic ledger substitutes.

Fineract1.15 savings-filtered journals can include loan counterpart rows. Preserve strict
account isolation; return independently validated savings rows while explicitly withholding
unsupported entity rows and marking the journal set incomplete for reconciliation. Journal
pagination must distinguish provider rows, excluded rows and remaining pages. Never match
an operation through a guessed transaction prefix or amount. Core business-date enquiry
currently returns no configured date; keep the application IST date explicit.

## Core customer 360 increment

Reuse CUS-01/03/04/12 and DEP-13. Staff enquiry must verify branch membership and the
registered Fineract client before loading its native portfolio and document metadata.
Show available balance from the matching native client-portfolio account, never substitute
ledger balance. Preserve per-source observation times. Display core legal form/status/office,
other native accounts, charge records, application profile/history, application document
metadata and any staged demo nominee declaration with explicit source/verification boundaries.
Core active status, uploaded metadata and simulated onboarding checks do not verify identity,
KYC, business mandates, signatures or nominee registration. This increment is read-only.

## Service-history drill-down acceptance

CUS-12 and service-centre increment: selecting a request within an owned branch relationship reads the existing case service and displays saved actors, transitions, notes, version, outcome and delivery state. The endpoint is read-only and returns no permitted mutations. Customer roles, foreign branch relationships and foreign-customer case identifiers are rejected. Errors withhold previous detail; customer changes clear selection. Fixture timelines remain unconnected. Case completion and delivery remain separate evidence.

## Daily service-work acceptance

OPS daily control lists saved open requests and fulfilled requests with outstanding/missing delivery evidence separately. Each row drills into its owned customer and saved case history. Fulfilled with delivery none/delivered/cancelled is not an outstanding delivery; unrecognised workflow states stay open. Incomplete loaded workflow coverage is explicit. Empty queues do not certify physical delivery, settlement or formal close. Last actors are historical evidence, not new responsibility assignments.

## Evidence validation follow-up

Actual Gregorian dates are required for returned transaction/journal/activation date evidence. Impossible or malformed transaction dates must not silently count as other-day activity while daily totals appear complete. Malformed business dates withhold aggregates. Optional delivery metadata must be text before browser rendering; missing fields retain explicit unavailable evidence. No financial command or date-selection policy changes.

## Branch case handling

CUS-12/service-centre increment: staff can handle the selected branch customer's existing case without switching the header customer. The existing case service owns permitted actions, version checks, transitions, independent approval, profile effects and history. Branch scope is verified before reads/actions. Case responses update only that customer's saved workflow rows in the branch snapshot; financial observation time is unchanged. Lost acknowledgements/conflicts require history refresh before another action. Existing service-centre routes remain the default for its shared component. Delivery recording remains a declaration, not physical verification. Local review fixtures still refuse writes.

## Native processing enquiry

OPS-01..10: Daily control lazily reads tenant-wide scheduler, jobs and business dates through branch-authorised GET only. Return a validated minimal projection; omit raw error/log/stack fields. Failed/malformed sources are unavailable, never zero/complete. Empty business dates mean no rows returned, with agreement unknown. Counts, scheduler active and last-run status do not establish branch/account COB, physical cash, settlement, reconciliation or close. Display source time and Core-provided times without inferring timezone. No trigger, scheduler mutation, date change or new close action. Validate staff/foreign branch access before Core requests; test malformed/duplicate/over-cap rows, refresh errors and mobile behavior.

## Operational filters

OPS-08/CUS-01: Directory text, loaded savings product and work filters compose without changing branch totals/coverage. Per-customer unresolved instruction counts drill into that customer's original command; service counts include open cases and unverified delivery. Core account unavailable is evidence absence, not no account. Instruction enquiry supports text/Core reference, exact registered customer, state and saved responsibility label filters. Directory work drill-down preselects that customer's queue and first unresolved original instruction. Unresolved uses the same pending/executing/uncertain/failed predicate as close blockers. Default enquiry shows all unresolved work. Selecting an original record remains scoped and visible when a filter subsequently hides its row, with explicit disclosure; no action is inferred from owner labels. Empty filtered results never certify completion. Clear/reset actions restore the respective defaults.

## Native advances and loan account enquiry

OPS-10/CUS-03/LEN-11: Overview reads loan principal and total outstanding for active registered branch clients using native client-filtered, paginated Fineract reads. Scope is registered clients in the servicing branch, not a bank-wide or account-owning-office return. Read at most 200 clients and 50 loans/client concurrently (8 requests); at most 500 returned loan rows. Incomplete registry/page/financial evidence withholds all aggregate figures; explicit zero/empty native pages differ from missing evidence. Ownership, INR/two-decimal currency, numeric precision and duplicate IDs are validated before display. Product totals sum native outstanding fields only; no derived journal, cash or reconciliation proof. Observation times and application date remain separate from unverified Core business-date/COB agreement.

Every returned loan drills into an owned registered customer in Account. The read-only loan resource verifies loan ID/client and returns projected summary, terms, Core repayment schedule and posted transactions. Missing amounts and schedule fields stay unavailable; invalid Gregorian dates withhold the response. Schedule dues and schedule funding amounts are calculated Core schedule evidence, separate from actual funding, recorded repayments and settlement; this distinction also applies to undisbursed/withdrawn loans. No new loan actions. Existing lending write/enquiry contracts remain unchanged, including their stricter accepted-terms/disbursement safeguards. Fixture data cannot invoke native loan reads. Test foreign clients even if upstream ignores its client filter, capped pages, duplicate loans, source failure, currency/summary/date errors, safe projection, refresh clearing and actual native production reads.

## Owned loan accounting and posting provenance

OPS-06/FND/LEN-11: Loan account enquiry opens Accounting for the same registered client and Core loan. Native loan-filtered journal pages, product accounting mappings and chart provide the financial evidence. Validate loan/client identity and INR money/calendar evidence before returning journals. Reject a foreign loan row; exclude non-loan/unknown counterparts with explicit partial coverage. Provider group strings are labels only. Exact journal `transactionDetails.transactionId` may link to the owned loan's native transaction and a confirmed, validated stored disbursement/repayment result. Never link through amounts, guessed prefixes or resource IDs.

Lending owns a minimal read-only posting-evidence projection. Reuse owned quote/context/history and original repayment validation; inspect the immutable origination result/command binding for disbursement receipts. Return source record/operation IDs, actors, timestamps and saved history only; do not expose full private quote/budget or add actions. Invalid/missing saved receipts leave the native journal available with provenance explicitly unavailable. Multiple receipts for one native transaction withhold ambiguous links. Historical workflow proof remains separate from current Core amounts; no balancing, settlement or branch close certification follows from journal presence. No database/Core write or migration.
