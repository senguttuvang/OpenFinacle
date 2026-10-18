# Integration contract

Registry checkpoint `45f83a3685e68721012d18647ab213cba2f77e35` consumed as `d9c7c25`. Finacle7 owns those modules, migration0016 and all ongoing registry changes.

- `createApplicantScope(session, originalOperationId)` allocates or resumes one lightweight bank scope with the original owner token hash. Recipient/employer references and an initial empty-account snapshot come from the prepared existing branch. No Core writes.
- `assertApplicantScope(session)` gates every onboarding read/write. Unfinished drafts reject other owner sessions; active registered customer sessions may read their own retained opening receipt after selection.
- `registerOpenedCustomer(session)` verifies active Core ownership and registers through the shared directory. No duplicate registry implementation.
- `onboardingRoute(request, session)` is a new route module. Shared HTTP integration calls it immediately after `getSession` (under the existing demo and same-origin guards), returning its non-null response. It owns `/api/onboarding*` and blocks legacy application writes for staged drafts.
- Start preserves the original session token; it changes that session's bank scope to the registry-created applicant bank. Lost start responses reuse the device-persisted original operation ID. `/api/session` is used first only to establish/resume the existing demo session.
- UI component `CustomerOnboarding` and standalone `/open-account` route use the same component. Shared new-customer entry links to `/open-account`; officer/approver application screens remain available in the portal using the same cookie scope.
- Existing approval remains the Core creation path. Finacle7's approval integration registers applicants. `continue` explicitly confirms registration and refreshes the applicant financial snapshot before navigation into their own portal.
- `inspect-opening` is approver-only and reads Core by original external ID; it reconciles only a fully active matching original account and client. It never dispatches Core writes. Missing/partial/mismatched outcomes remain blocked.

Migration0017 adds only `onboarding_drafts`, follows0016, and is not applied remotely by Finacle6. Draft updates use optimistic versions; submission atomically changes draft to `submitting` before invoking the existing application service. Canonical application rows reconcile lost submission acknowledgements. Unconfirmed failures remain reserved for inspection.

## Integrated checkpoint

Finacle7 explicitly released the shared edit lease at `d47d8c8`; Finacle6 merged it as `865ab83`, taking the registry owner's latest versions for duplicate checkpoint additions. Planning PR93 and repayment PR92 ancestry are preserved. The HTTP route hook and primary entry are now wired. The original shared branch demo remains explicitly labelled; applicant customer views use the staged component and staff views retain existing review controls.

Onboarding requests bind the verified `bankId` into the shared customer-scope header after load, before role changes and after applicant allocation. Stale responses continue to be rejected by the shared API client. Opened registered customers can revisit their receipt after selection; unfinished drafts remain bound to the registry's original session. A separate applicant requires an explicit user action and never deletes the prior record or replaces an uncertain instruction.

The handler also protects the legacy `/api/application` route when a staged draft exists. Migration0017 backup checks accept either an absent onboarding schema or the complete table and both immutable-identity/reset guards; partial exports fail closed. Finacle5 is the release coordinator and owns real-Core/native acceptance. Finacle6 opens a private PR only; no merge, remote migration, seeding or production release.
