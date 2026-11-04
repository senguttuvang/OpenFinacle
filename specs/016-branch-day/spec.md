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

## Native loan worklist and daily exceptions

OPS-10/LEN-11: Daily control lazily reads the same branch-authorised native loan book and defaults to returned `totalOverdue > 0`. Product IDs, native state IDs, customer/account/Core references and evidence filters compose over loaded records only. Missing summaries remain unknown and have a separate filter; explicit zero differs from missing. No date arithmetic, NPA classification, collection action or ageing/business-date agreement is inferred. Each original row opens its owned loan enquiry. Overview gains the same filters while whole-book product totals and source coverage remain unchanged. Partial coverage remains visible even with no filter matches; empty lists never certify absence of arrears, reconciliation or close. Failed refresh clears old records. Existing financial and staff-authority contracts are unchanged.

## Savings accounting evidence parity

OPS-06: Savings and loan journals share strict INR/two-decimal money, safe native IDs, valid date/entry type, unique journal IDs and bounded provider-page validation. Savings product identity must match the owned native account product. A short or inconsistent provider page is unavailable, never a complete journal set; next-page navigation stops on withheld evidence. Valid loan counterpart rows remain excluded and counted before pagination. Chart IDs must be unique and safe, and GL mapping references safe. The savings browser decodes the evidence envelope before rendering and clears malformed responses. No write, accounting arithmetic, reconciliation certification or migration is added.

## Registered-relationship GL journals

OPS-06/FND: Accounting can read one native GL across the registered branch, rather than only one savings subledger. An owned anchor relationship supplies a separately validated native client office; this is a journal-office filter, never new application-branch authority. The branch's bounded native-account ownership reads must corroborate every retained savings identity. Loan ownership is independently read by native loan ID/client ID and matched to an unambiguous eligible registered relationship (at most50 unique loan lookups/page, concurrency8). Manual, unidentified, unregistered, ambiguous or unavailable-owner rows are excluded without exposing their amounts/names. Foreign office/GL rows or invalid source pages withhold the page. Provider pagination counts the raw rows before exclusions; registry/workflow/owner limits and separate observation times remain visible.

Only exact, unique, posted deposit/withdrawal command references scoped to the registered savings account may link to a saved original instruction. Transfer/reversal resource IDs, provider-group labels and equal amounts never establish that association. Native loan rows open their owned enquiry and existing receipt trace. GL selection and customer changes reset dependent selection; failed refresh removes old evidence. Named financial tables support keyboard scrolling and mobile text enlargement. The enquiry adds no totals, running balance, ledger, current cash position, report execution/configuration, financial action or close proof. Core's uncomputed stored zero and currency-less trial-report amounts remain withheld; the outstanding cash-position contract is tracked separately.

## Synthetic teller/vault count declarations

OPS daily control: a branch-scoped count register records explicit synthetic declarations, not Core cash balances or physical verification. Every supported denomination quantity must be supplied; missing is not zero. A deliberate form action may fill remaining blank slots with zero before submission. INR face-value slots are a supported demo subset, not a legal-tender inventory. Quantities are bounded nonnegative integers; totals are derived exactly from declared quantities only and never reconciled against a guessed book balance. Reported IST count date, teller/vault label, note, actor role, source, saved time and version accompany each total.

An officer submits a declaration. An approver may review or return it; an officer may resubmit a returned declaration with corrected quantities or withdraw submitted/returned work. Reviewed/withdrawn records are terminal. Demo roles are separate application authority only, not independent authenticated employee identities. A reviewed declaration does not verify physical cash, handover, settlement or close. Count identity (branch/type/label/date/source/currency) and all saved events are immutable. Each transition appends one atomic event with optimistic version checks and a branch-scoped original key binding actor/action/payload. Exact replays return the original event reference plus current state; mismatches/conflicts never apply a second transition. Lost acknowledgements retain the original request across reload and require explicit inspection/retry of that same key; no automatic POST replay.

Lists cover at most100 latest count records; detail history exposes its200-event limit and withholds further actions if incomplete. Source failures never become empty successful lists or zero counts. Customer roles, foreign branches, malformed amounts/dates/source labels, stale versions, terminal/incorrect-role actions and modified replay payloads are rejected. Daily control remains blocked regardless of count-review state. Migration0020 is additive/append-only and requires a fresh exact-source restore-proven workflow backup before production application. No Core financial/report/job/configuration call or secondary financial ledger is introduced. Verify SQL atomicity/immutability and application/API/browser recovery, concurrency, ownership, role, enlarged-text and existing-flow regression gates before deployment; accept a uniquely owned synthetic declaration/review journey live without altering existing financial/customer state.

## Existing statement balance preservation

DEP-13/existing-flow acceptance: a missing/null native savings transaction running balance is unavailable, never zero or a reconstructed position. Explicit finite native zero, negative and positive running balances retain their source values. Statement enquiry/search and the current CSV download remain usable. This correction introduces no financial computation, Core command, migration or new authority. Reproduce the false-zero regression before changing the UI and verify desktop/mobile, exact-source gates and read-only native statement/state acceptance after release.

## Owned branch savings enquiry and export

DEP-13/CUS/OPS: Staff can enquire/export the selected registered branch customer without changing the header-selected relationship. Resolve staff/branch membership and independently verify native account ID, client ID, account number and INR/two-decimal currency. Use the Fineract1.15 GET savings transaction search, not an omitted account association, for explicit matching totals and empty results. Its offset parameter is a zero-based page number, not a row offset. Validate returned account/currency IDs, dates, money precision, unique descending transaction IDs, native page number/size/sort and exact page coverage. Native transaction value-date filters are inclusive; booking/IST timestamps and unverified Core business-date agreement remain separate. Missing/null native running balance, entry type or reversal state is unavailable, never inferred.

Page enquiry uses200 rows. Full-range export independently reads all matching pages, at most5000 records/concurrency4, withholding the entire export if source counts, page coverage, order/identity/financial/date evidence fail or the limit is exceeded. Native paged reads are not an atomic snapshot. Do not reconstruct opening/closing/running balances, financial direction, cash positions or settlement proof. Exports preserve source/read-window/servicing-branch/native-account/date-range/count provenance even for an explicit empty result. CSV uses a consistent enquiry/transaction record schema, quotes fields and prefixes dangerous text cells against spreadsheet formulas; numeric financial fields remain source values. No original command linkage is guessed.

Enquiry is lazy; date edits, refresh, role/customer changes and failures clear stale rows/export availability. Export uses an independently validated current response for the same registered branch/customer/native account/date range, never header scope or silently partial pages. Keep source freshness separate from parent financial observation. Read-only GET routes, no migration/new authority/Core financial or configuration command. Test true foreign branches/accounts, malformed/ambiguous/over-cap/empty source, inclusive valid dates, missing-versus-zero values, native page-number semantics, cross-page duplicates/count changes/order, CSV formulas/escaping/empty provenance, slow/stale scope replies, keyboard/mobile/date filtering/download and existing flows; require full exact-source local/PR/main gates and native state-preserving acceptance.
