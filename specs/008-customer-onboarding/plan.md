# Integration contract

Registry checkpoint `45f83a3685e68721012d18647ab213cba2f77e35` consumed as `d9c7c25`. Finacle7 owns those modules, migration0016 and all ongoing registry changes.

- `createApplicantScope(session, originalOperationId)` allocates or resumes one lightweight bank scope with the original owner token hash. Recipient/employer references and an initial empty-account snapshot come from the prepared existing branch. No Core writes.
- `assertApplicantScope(session)` gates every onboarding read/write. Shared permanent scenarios and other owner sessions are rejected.
- `registerOpenedCustomer(session)` verifies active Core ownership and registers through the shared directory. No duplicate registry implementation.
- `onboardingRoute(request, session)` is a new route module. Shared HTTP integration calls it immediately after `getSession` (under the existing demo and same-origin guards), returning its non-null response. It owns only `/api/onboarding*` endpoints.
- Start preserves the original session token; it changes that session's bank scope to the registry-created applicant bank. Lost start responses reuse the device-persisted original operation ID. `/api/session` is used first only to establish/resume the existing demo session.
- UI component `CustomerOnboarding` and standalone `/open-account` route use the same component. Shared new-customer entry links to `/open-account`; officer/approver application screens remain available in the portal using the same cookie scope.
- Existing approval remains the Core creation path. Finacle7's approval integration registers applicants. `continue` explicitly confirms registration and refreshes the applicant financial snapshot before navigation into their own portal.
- `inspect-opening` is approver-only and reads Core by original external ID; it reconciles only a fully active matching original account and client. It never dispatches Core writes. Missing/partial/mismatched outcomes remain blocked.

Migration0017 adds only `onboarding_drafts`, follows0016, and is not applied remotely by Finacle6. Draft updates use optimistic versions; submission atomically changes draft to `submitting` before invoking the existing application service. Canonical application rows reconcile lost submission acknowledgements. Unconfirmed failures remain reserved for inspection.
