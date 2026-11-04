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
- Savings totals cover at most 200 registered relationships, not all bank accounts or advances.
  Journal enquiry pages provider rows in batches of 200, with excluded counterpart counts; audit history exposes its latest-100 limit per relationship. Branch commands and service requests are bounded at 5000 each and expose incomplete coverage if exceeded.
- Native client legal form and document metadata are enquiries, not verified identity, mandates, signatories or KYC. Staged nominee declarations do not establish core registration.
- Customer 360 lists savings, loan and working-capital families returned by the native portfolio. Consolidated bank advances, fixed/recurring deposit totals and the full product tariff remain unavailable.
- Teller/vault physical counts, handover, external statement matching, settlement reconciliation,
  formal close and core processing completion remain unavailable. Close readiness stays blocked.
- Manager/accountant/teller/checker viewpoints are navigation aids. Officer/approver are existing
  demo roles over a technical core principal, not independent production staff identities.

Migration is additive; do not deploy the new branch API against a database missing 0019.
Rollback application code through the normal release path; retain the responsibility table
rather than deleting workflow history. No deployment or production-readiness claim is made.

## PR116 live checkpoint and follow-up

PR116 merged at `2b75fbe3b2007b6f61ea5d2a63acc528460b961c` and deployed. Live health identified that source; core readiness recovered after container warmup. The 101-customer directory and sampled core balance were retained. All six live views opened with no browser errors or mobile page overflow. Its conservative journal guard withheld a mixed savings/loan-counterpart set, and its 100-customer cap left one relationship out; this acceptance increment addresses both findings. The native Fineract1.15 savings filter uses linked savings-transaction identifiers and can include a loan counterpart. Non-savings rows remain excluded and explicitly counted; a foreign savings-account row still withholds the page. No journal balance or settlement certificate is inferred.

## Customer 360 acceptance increment

Read-only native client, client portfolio, document metadata and savings charges are schema validated after staff/branch ownership checks. The registered savings account must match the portfolio account number and INR currency precision. Available balance comes only from that native portfolio; missing evidence is unavailable and zero remains zero. Core terms are displayed without inferred interest or fee arithmetic. Application profile history and document metadata remain visibly separate; storage object keys are never returned.

Integration checks exercise ownership rejection before core reads, mismatched client/account/currency, absent evidence, zero versus ledger balance and scoped document metadata. Browser coverage checks keyboard refresh, updated profile, zero available balance, terminal service counts and mobile reflow at 200 percent text. This increment has no migration, financial write or resource change. Live verification remains a separate release step.

## Branch service-history enquiry

The branch service-case endpoint first resolves the staff-owned branch customer and then delegates to the existing case service using that customer's scope. It returns a read-only projection with no actions. The account screen loads the selected saved request, version, outcome, last actor, ordered events and delivery state; refresh failures remove previous evidence. Review fixtures cannot load native case timelines. Integration checks cover customer role rejection, foreign branch/customer identifiers and no mutation actions. Browser checks cover keyboard refresh, failed refresh and mobile text enlargement. Case completion remains distinct from physical delivery and core financial effects.

## Daily service exceptions

The daily-control queue uses saved service requests across the loaded branch. Open/unknown workflow states and fulfilled requests with unverified delivery are listed with an owned-customer drill-down. Known none/delivered/cancelled delivery states do not create outstanding delivery rows. Missing delivery evidence remains explicit. Actor labels report history, not ownership grants. The same terminal-state predicate drives the open-case count. State tests cover unknown and terminal workflow/delivery combinations; the browser journey verifies delivery disclosure, exclusion of no-delivery completions, customer drill-down and mobile text enlargement.

## Calendar and delivery evidence validation

Core account, journal and activation dates require valid Gregorian calendar dates. Daily totals independently reject malformed business or transaction dates. Evidence tests cover leap days, impossible months/days, incomplete/fractional/nonfinite dates and malformed delivery metadata; browser negative cases withhold totals and servicing controls when the branch envelope is invalid. Missing delivery fields remain optional and unknown textual states remain visible. These checks change no financial command or core configuration.

## Connected branch case handling

The branch case routes now return existing role-permitted actions and delegate versioned actions to the established case service after branch/customer scope checks. The shared service-case form accepts explicit branch read/action paths; its existing service-centre defaults are preserved. Accepted responses update the selected customer's workflow rows, while financial observation time stays unchanged. Role changes reset the branch case form; profile-effect receipts trigger a read-only customer360 refresh. Conflicts/lost acknowledgements retain the original case and require history refresh, with no automatic action replay. Integration checks cover cross-customer/foreign-branch isolation, maker/checker restrictions, approved profile effects, stale versions and absence of core financial writes. Browser checks confirm scoped review, lost acknowledgement recovery, refreshed daily queues and existing service-centre behavior.

## Native processing metadata

Daily control now has a lazy, refreshable GET-only processing enquiry. Staff/branch membership precedes three bounded Core reads; schemas strip raw diagnostic fields and reject duplicate/over-cap jobs and invalid business dates. Each unavailable source is separate from an empty returned list. Live pre-release read compatibility was checked against Fineract1.15: scheduler active, 41 jobs, no business-date rows. Times are Core values with no inferred timezone. Job status, enabled/running counts and scheduler state do not establish branch/account COB or financial close. Five focused tests cover projection, staff/foreign registered branch isolation and malformed evidence. Desktop/mobile browser checks cover lazy reads, unchanged close blockers, refresh failure clearing and no branch writes. Exact full local and GitHub CI plus post-release runtime verification remain release gates.

## Connected operational filters

Customer work and savings-product filters compose with directory search over loaded evidence. Unresolved instruction counts open the registered customer's filtered queue and first original instruction. The instruction enquiry composes text/Core reference, exact customer, state and saved owner-label filters; its default includes pending/executing/uncertain/failed work. Filtering leaves branch totals, coverage and financial decisions unchanged. Selected details remain correctly scoped and explicitly visible outside filters. Empty filtered queues do not certify completion. Focused state tests cover intersections, Core absence, fulfilled delivery exceptions, ownership and uncertain outcomes; desktop/mobile checks cover keyboard drill-down, clear/reset actions, retained original detail, disabled decisions and enlarged text. Existing service-centre/profile checks remain required.

## Native loan exposure and account enquiry

The branch read-only loan API uses registered client IDs and literal GET queries; it does not call or weaken the existing loan write/accepted-terms services. Client-filtered list and individual loan ownership are independently validated. Principal and total outstanding remain separate native summary fields; source, currency, read window, application date and incomplete coverage are explicit. Partial registry/loan-page/summary evidence withholds all product totals. Core periods, funding rows, due/paid/outstanding amounts and recorded transactions stay separate; missing fields are unavailable, with strict Gregorian dates and monetary precision. Schedule `sourceLine` is an application projection position for rendering, not an upstream financial identifier.

Pre-release compatibility: Fineract1.15 GET loan pages validated for all 102 registered clients (four loans, client52 matched to its registered branch relationship); the bounded list read took about17 seconds. Native loan1 summary/schedule/transactions validated. These are Core reads only. Focused tests cover roles, foreign registered branches/clients, duplicate identities, capped/failed pages, registry capacity, currency/precision, missing versus explicit zero and calendar errors. Desktop/mobile journeys cover lazy loading, product-to-owned-loan drill-down, schedule versus recorded transactions, read-only controls, failed refresh clearing, incomplete aggregate withholding and enlarged text.

## Native mobile audit-context regression

Live loan acceptance exposed document overflow at390px/200percent text in the full registered customer's account view. The cause was unbroken audit workflow identifiers outside table scrollers. A synthetic saved `service.awaiting_approval` audit entry reproduces the failed check before the fix. Branch panels now allow long identifiers to wrap; loan tables retain their own horizontal scroll areas with explicit accessible labels/focus, including arrow-key panning. This changes layout only; financial data, source contracts and permissions are unchanged. Complete live active/withdrawn loan acceptance remains required after deploying the fix.

## Loan product accounting and saved posting provenance

The owned-loan accounting GET route validates registered branch/customer/client/loan scope before parallel Core chart, product and paginated journal reads. Native loan entity and explicit transaction-detail IDs establish associations; provider labels and equal amounts never establish identity. Invalid currency, precision, calendar, duplicate IDs, foreign loan rows or inconsistent page coverage withhold evidence. Saved disbursement and repayment receipts reuse validated immutable application/operation records, ownership and exact native transaction IDs; ambiguous or invalid receipts remain unavailable. Read projections exclude raw private operation JSON. No financial command, migration or Core write was added.

Focused checks cover confirmed disbursement/repayment history, source tampering, role/customer/foreign ownership, counterpart exclusion, page coverage, product identity and ambiguous references. All 24 branch/service/profile browser checks passed, including GL filtering, provider pagination, exact receipt/history drill-down, failed refresh clearing, same-number loan/savings namespace separation, desktop/mobile and enlarged text. The full local suite passed with435 tests before source freeze. Exact committed-source local/GitHub checks and production native-source acceptance remain required release gates.

## Daily native loan worklist

The existing read-only native loan exposure now has composed customer/reference, exact product/state-ID and evidence filters. Daily control uses the same source and defaults to positive native overdue; Overview preserves its whole-book product totals. Missing/null summaries never match explicit-zero or positive-overdue filters. No source values, Core dates or native state classifications are recomputed. No new endpoint, migration, collection instruction or financial write was added.

Four focused tests cover missing-versus-zero, intersections, same-name/different-ID products and immutable original source identity. The 26 desktop/mobile branch/service/profile browser checks passed, including lazy daily reads, partial-coverage disclosures, original owned-loan drill-down, failed refresh clearing, reset/recovery, unchanged whole-book totals, enlarged text and retained header context. Full local checks passed439 tests before final source freeze; exact committed-source gates and native production acceptance remain required.

## Savings accounting evidence validation

The savings accounting reader now shares strict INR/two-decimal monetary, safe journal/office/GL/native-transaction identity, entry-type and unique/bounded page validation with loan accounting. Provider coverage is checked before excluding loan counterparts; inconsistent or foreign subledgers withhold journals and stop next-page navigation. Product identity must match the owned savings account; invalid product evidence is separate from valid journals. Chart identities are bounded, unique and safe; GL mapping IDs are safe. The savings browser decodes the envelope before rendering and clears invalid financial data or error collections. No financial write or migration was added.

Fourteen focused regression cases cover currency, money precision/sign/range, IDs, entry types, duplicate/fractional/inconsistent page metadata, real200-row pagination, original native references, wrong products and ambiguous chart/mapping IDs. The full local check passed453 tests before final source freeze;28 desktop/mobile branch/service/profile browser journeys passed, including malformed savings responses and the existing accounting, loan, profile and case journeys. Pre-release live compatibility accepted three owned savings journals from four provider rows, ten chart rows and nine product mappings; the excluded loan counterpart remains explicit. Exact committed-source and merged local/GitHub gates plus production state/native journal acceptance remain required.

## Registered-relationship GL enquiry

The new GET-only GL route begins with staff/registered-branch membership and validates the selected anchor's native savings identity, native client office and GL identity. It reads a bounded native office/GL journal page, then returns only independently owned registered savings/loan entries. A shared Core office grants no application-branch authority. Foreign office/GL IDs, malformed financial/date evidence, duplicate/out-of-order IDs or inconsistent provider coverage withhold the page. Manual/unidentified/unregistered/ambiguous/unverifiable rows expose counts only. Native loan ownership reads are capped50/page with concurrency8. Provider offsets count raw rows before exclusions; registry/workflow/ownership limits stay visible. Cash instruction links require a unique posted deposit/withdrawal reference with the exact native transaction ID and registered account/bank; resource-only transfer/reversal IDs never establish origin. Limited workflow coverage withholds links.

Ten focused tests cover these boundaries, unavailable accounts, true foreign registered relationships, namespace collisions, ownership lookup limits/failures, pagination and ambiguous/unposted/foreign/resource references. The complete pre-freeze local check passed463 tests and real Docker Wrangler dry run;30 desktop/mobile branch/service/profile browser checks passed, including GL search, original cash and owned-loan drill-down, failed/foreign-scope refresh clearing, pagination, retained header context and keyboard scrolling at enlarged text. Financial table scrolling and branch evidence reads now share the established behavior across savings/loans/GL. No balance arithmetic, running position, native report execution, Core mutation or migration was added. Exact committed/merged gates and native source/state-preserving acceptance remain release requirements.

Read-only Core1.15 research found172 cash-GL journal rows; the first two entries requested by descending ID carry an uncomputed stored zero. The inspected trial-balance/general-ledger reports lack currency, and their date/office rules differ. Those values are not cash-position or reconciliation proof. Source contract: [native journal API](https://github.com/apache/fineract/blob/1.15.0/fineract-provider/src/main/java/org/apache/fineract/accounting/journalentry/api/JournalEntriesApiResource.java), [native read service](https://github.com/apache/fineract/blob/1.15.0/fineract-provider/src/main/java/org/apache/fineract/accounting/journalentry/service/JournalEntryReadPlatformServiceImpl.java). Current cash positions remain a separate unverified capability.

## Synthetic teller and vault count declarations

Daily control now reads and records branch-scoped synthetic denomination declarations. Ten explicit supported denomination quantities produce an integer-paise declared total; blank/missing quantities remain unknown rather than zero. Officer submission, approver return/review, officer corrected resubmission/withdrawal, immutable identity/history and terminal states are enforced by the service and additive0020 SQL triggers. One atomic append binds the original command key to actor, canonical payload and optimistic version. Replaying an original request returns its confirmed event separately from the latest state. Counts never call Core, establish a cash-book balance/variance, post a ledger entry or prove physical verification, handover, settlement or close. Demo roles do not establish independent production staff identity.

The form preserves an original pending request in tab session storage before sending. Reload never automatically posts. Explicit inspection/retry retains the original key and payload; malformed or missing replies keep the pending reference. Only definite server rejections release it; client customer-scope changes remain uncertain. Branch and role changes remount the workflow view, and count saves do not refresh the financial observation. Lists expose100-record coverage; histories expose the first200 events with latest state separate and further actions withheld when incomplete.

Ten integration/domain checks cover explicit-zero versus missing, malformed quantities/dates, role/branch guards, concurrent decisions, original replay/payload binding, immutable SQL history, forged snapshots, excess route fields, acknowledgement loss/unavailable confirmation, list limits and over200-event action withholding. The pre-freeze full local gate passed473 tests, strict architecture/static checks, production export and real Docker Wrangler dry run. All52 branch/customer/service browser journeys passed against the production export; four count journeys additionally passed after keyboard/200percent text and definite-rejection recovery assertions. Self-review checked the full append/replay, request projection, role/branch, concurrency and recovery paths; no financial or Core configuration write was introduced. Exact committed/merged checks, GitHub CI, a fresh exact-source restore-proven protected backup, migration0020 and native production/state-preservation acceptance remain release requirements. Application rollback must retain the additive count-history table and every saved event.

## Missing native statement running balance

The scope audit found that the existing customer statement formatted an omitted running balance as zero, while the CSV route already left it blank. A production-export browser regression reproduced expected `Unavailable` versus actual `₹0.00` before the correction. The statement now labels native running balance explicitly and withholds missing/null/nonfinite values without rebuilding a balance. Explicit finite zero, negative and positive balances remain source values. Desktop/mobile checks cover those values, transaction search, unchanged CSV link and absence of writes. No Core request/configuration change, migration or financial arithmetic is introduced; exact-source local/GitHub gates and read-only production/native state acceptance remain required.

The broader75-journey run also exposed a superseded `/demo` branch test that mocked only the selected customer's dashboard and expected the retired single-customer overview. It now supplies the actual branch envelope and verifies both registered customers' pending/uncertain original instructions, search/empty/reset behavior, daily service work, blocked close, mobile layout and absence of mutations. The focused updated entry journey passed; no product branch behavior was changed for this test.

## Owned branch savings statement and CSV

The lazy GET enquiry resolves staff/registered-branch membership before native account metadata and transaction search. Account/client/account-number/INR identity is independently checked, then every row must retain that native account/currency, valid native value date and exact monetary precision. Native page number/size/descending-ID sort, expected row count and range membership are validated. Search exposes an explicit native total and empty array; the account association can omit an empty collection and is not used to infer no activity. Native client-office metadata does not establish account-owning or originating office.

Fineract1.15 source: [savings transaction search](https://github.com/apache/fineract/blob/1.15.0/fineract-provider/src/main/java/org/apache/fineract/portfolio/savings/api/SavingsAccountTransactionsApiResource.java), [page-number request](https://github.com/apache/fineract/blob/1.15.0/fineract-core/src/main/java/org/apache/fineract/portfolio/search/data/TransactionSearchRequest.java). The parameter named offset is passed as a zero-based PageRequest index. Live GET compatibility on the existing owned account156 validated metadata and three search responses, including the native explicit empty total0. Read projections omit raw operator/payment data.

Full-range export rereads all matching pages, up to5000 records with concurrency4. Changed counts, incomplete/foreign/malformed pages or duplicate/out-of-order cross-page IDs withhold the whole export. CSV has one fixed provenance/enquiry record even with no transactions, explicit native value dates and read window, source numeric values and safe quoted text cells. Missing running balances/reversal/entry state are unavailable, never zero or inferred. The CSV cannot establish atomic opening/closing, cash, settlement or close evidence.

Shared branch evidence now binds saved responses to their path, schema, branch and refresh revision before rendering, clearing stale financial data immediately on a new request. Role/customer/native-identity changes remount the export view; date/refresh changes invalidate outstanding export generations. A late result cannot download under the changed scope. These are GET-only enquiries; no migration, financial command or Core configuration change was added.

Fourteen new integration/CSV checks cover real foreign branch registration, forged native identity, inclusive dates, page-number semantics, missing-versus-explicit-zero/negative values, malformed money/dates/currency/metadata, duplicate or changed pages, no-store routing, explicit empty provenance, text formula/quote/control escaping and the full5000-row boundary. Pre-freeze full local checks passed487 tests, strict static/architecture gates, production export and real Docker Wrangler dry run. All78 banking/branch/customer/service production-export browser journeys passed, including the three new desktop/mobile/200percent keyboard/download/paging/filter/empty/failed-refresh/stale-export journeys. Exact committed/merged local/GitHub gates and native production CSV/ownership/header/count/customer-state/source acceptance remain release requirements.

## Exact native monetary evidence and movement classification

The original fractional-paise regression accepted a native ledger value of1.001 as100minor with complete=true. It now withholds malformed evidence. Displayed ledger/available/posted-interest/fee/penalty amounts require exact safe INR cents; transaction and saved-instruction amounts cannot be negative. Exact BigInt sums withhold overflow. Native product IDs separate equally named products and govern safe product subtotals. Daily movement totals use native CREDIT/DEBIT entry types, including interest/fees/internal movements, with explicit reversal=false; missing relevant classification/reversal evidence is incomplete. Known reversed records remain excluded. Resource/registered-account ownership, client, currency, calendar and duplicate identifiers are checked without reconstructing balances or inferring an account-owning office.

Pre-release full local checks passed497 tests. Ten new focused tests cover invalid source amounts, signed balances, classification, ownership, exact sums, aggregate/product overflow and missing evidence. Five new exported-production browser checks passed at desktop/mobile, including actual root text doubling, incomplete source withholding and no API writes. A separate read-only native compatibility probe on2026-11-04 validated all102 registered accounts against the new schemas: complete ledger1044346811minor, one native savings product ID1, and no application-date credits/debits. This is sampled native read-window evidence, not an atomic snapshot, cash position, external settlement or Core business-date agreement. No migration, Core command or resource change is introduced. Full exact-source/browser/PR/main and post-release state checks remain publication gates.

## Customer360 native monetary precision

Fixture regression: source33a62c3 accepted INR portfolio balance1.001 and displayed₹1.00. Portfolio ledger/available/loan balances and native charge amount/paid/outstanding now require safe exact minor units at the reported precision. INR is precision2; foreign precision0..20 remains in its original currency without conversion. Missing currency/precision or unsupported values cannot become valid-looking zero/rounded amounts. A shared primitive preserves existing savings behavior; formatting independently guards invalid values. Source failures retain valid client/documents/profile and distinguish missing available balance from zero.

The [pinned Fineract1.15 SavingsAccountChargeData](https://github.com/apache/fineract/blob/1.15.0/fineract-core/src/main/java/org/apache/fineract/portfolio/savings/data/SavingsAccountChargeData.java) exposes monetary amount/paid/outstanding separately from percentage and amountOrPercentage. The projection uses only monetary fields. Pre-release local checks passed503 tests, including six new source/precision/isolation checks; two exported-browser journeys passed desktop/mobile root text doubling, foreign three-decimal values, zero, malformed-refresh clearing and per-source recovery without writes. Read-only live compatibility on2026-11-04T03:42:48Z validated all102 portfolios and102 charge responses;101 selected available balances were returned and one was omitted. All charge lists were empty, so positive monetary-charge/percentage cases remain fixture/contract evidence. Full exact-source/PR/main gates and post-release native/state verification remain required. No migration, Core write or new authority.
