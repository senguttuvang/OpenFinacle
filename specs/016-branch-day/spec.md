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
