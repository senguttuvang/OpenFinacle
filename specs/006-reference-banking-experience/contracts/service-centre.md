# Service centre contract

The first implementation slice covers request-led servicing, with a directory, structured forms, review, durable case references, tracking and staff processing. It does not turn card controls, deposit applications or loan applications into generic fulfilled requests.

## Evidence and boundary

The reference service directory and category families were observed. Individual forms and validation rules in this initial catalogue are inferred demonstration contracts; they have not been verified against every bank form. Each catalogue entry records this evidence class. Exact end-to-end reference parity remains open until its forms and states have been inspected and compared.

Entries use simulated service fulfilment. Approved address, email, branch and employer changes materialize the [synthetic relationship profile](profile.md) with source-case history after migration 0008. They do not change Fineract accounts, authoritative identity records, card credentials or external delivery networks. Existing financial operations remain behind their own real core commands. Never collect bank passwords, card numbers, PINs or OTPs in service forms.

## Catalogue and form contract

An authenticated `GET /api/service-catalog` returns service definitions with stable codes, customer titles, category/group, description, approval policy, delivery type, fields, evidence class and backend mode. The endpoint reads no banking core and accepts no mutation.

Fields have stable keys, labels, input types and enumerated options where appropriate. Validate values on the server, reject unknown fields, trim input, enforce length/format limits and check dependent dates. These validation decisions are deterministic domain behavior. Client validation supplements server validation.

The initial scope is request-led account maintenance, statements, transaction enquiries, cheque delivery, debit card replacement enquiries, card correspondence/billing enquiries, deposit servicing enquiries, loan documents, relationship linking and forex servicing enquiries. Application-style product operations and immediate security controls need separate operation contracts.

## Case lifecycle design

The subsequent case API must support durable submission with an idempotency key, scoped list/detail/history, optimistic version checks, and explicit authorized actions. Customer and staff views share one persistent case. Attach history and audit to successful transitions atomically.

Customers can create, provide requested information and cancel eligible unprocessed cases. Officers can start processing, request information, reject with a reason and complete routine cases. Maintenance requiring independent authorization goes from officer review to an approver before simulated fulfilment. Closed cases cannot be reopened or silently overwritten. Physical delivery has its own simulated tracking states.

Preserve existing request records and outcomes when introducing richer fields/history; do not invent historical events or silently reset data. Record imported state explicitly. Prevent existing simple resolve routes from bypassing authorization on richer cases.

## Acceptance evidence

The case API uses authenticated `GET /api/service-cases` for paginated search, `GET /api/service-cases?id=...` for scoped detail/history, `GET /api/service-cases?key=...` to inspect a submission after an uncertain transport response, `POST /api/service-cases` for structured submission with an `Idempotency-Key`, and `POST /api/service-cases/action` for explicit versioned actions. Detail/action responses contain the current request, ordered history and allowed actions for the authenticated role/current state. The original submitted payload remains immutable even after a customer supplies revised information; retrying its original submission cannot create another case.

Migration 0005 adds fields and history without deleting existing requests. Imported history is marked as unavailable before import, rather than invented. SQLite triggers record field/detail snapshots and audit metadata in the same statement as a successful transition. Managed cases reject unversioned updates and submission-identity changes at storage level, so an older simple resolve path cannot silently bypass the workflow after a rollback. Keep the additive schema on rollback; never reset shared cases. Back up the remote workflow database before applying this migration. The customer/staff UI layer must be released with the workflow before claiming a completed journey.

Domain tests cover unsupported/extra fields, missing values, allowed choices, invalid calendar dates, dependent ranges, formats and limits. Case tests must cover ownership, roles, sensitive approval, invalid/stale transitions, idempotency conflicts, persistence and history/audit consistency. UI tests must cover discovery/search, form/review/edit, submission/outcome, request and deliverable tracking, staff processing and keyboard/mobile behavior using synthetic data.

The catalogue foundation alone is not a completed service journey. Execution and remaining work are tracked in Beads `of-9hc.1` under the reconstruction feature.

Legacy unstructured submission and simple completion endpoints return a conflict and direct callers to the service centre. Migration 0006 rejects new cases without a submission key and requires a versioned import for legacy updates. Existing legacy records stay readable and retain their imported history; sensitive maintenance still requires structured customer information and independent authorization. An older Worker cannot create or silently complete unversioned requests after application rollback.

## Customer and staff screens

The service centre loads only when its screen opens. Customer entry points separate the searchable, grouped service directory from request tracking and deliverable tracking. Deliverables use the server-filtered `GET /api/service-cases?view=deliveries`; counts, search and pagination apply to the complete filtered relationship queue. Historical records with unknown delivery are not presented as dispatched items.

Forms validate before a review/edit step. Before sending a submission, the browser retains its original fields and stable key in session storage scoped to the demonstration relationship. An interrupted response locks further submission until the key is inspected; reload and reopening a form restores that check. A confirmed case clears the pending key. Browser storage failure blocks sending rather than losing the reconciliation reference.

Case detail displays the current request and immutable history snapshots. Action controls use server-returned role/state permissions, capture the displayed version, require relevant notes and review confirmation, and refresh after an uncertain or conflicting outcome before another write. Dialogs use focus trapping and focus restoration; cancellation and rejection are confirmed through the alert-dialog primitive. Physical fulfilment and delivery receipt remain separate simulated events.

This release remains a request-led servicing slice. Dedicated [card controls](cards.md) and the [synthetic profile effect contract](profile.md) have their own product state. Deposits, loans, investments, insurance, broader branch operations and exhaustive comparison with reference forms remain under the parent reconstruction requirement. Completed generic cases do not stand in for those capabilities.
