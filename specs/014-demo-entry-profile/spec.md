# Public Website, Demo Entry and Profile Actions

## Outcome

Visitors can browse the public product website whether or not a demo session exists. Entering the banking workspace is deliberate. The avatar/name opens an accessible profile menu with profile, website and logout actions.

## Behaviour

- `/` and `/discover` always render the public product story, without fetching a customer dashboard or selecting a customer. Public capability/roadmap/build pages stay independent of demo state.
- Public demo actions lead to a real `/demo` entry. An existing session resumes its own workspace; without a session visitors choose an existing customer or a synthetic onboarding/shared journey. A URL never posts a financial command or silently selects a different customer/persona.
- All existing banking bookmarks remain valid and restore only the saved session; unauthenticated deep-entry still preserves its requested destination through customer selection.
- The topbar avatar/name is a Radix profile-menu trigger, using existing colours, typography and targets. It exposes My profile, Back to website and Exit demo (log out). Native navigation links retain modified-click behaviour.
- Back to website and brand/home links return to the public website without ending the session. Users can deliberately resume via the demo entry.
- Exit demo calls the existing session-end endpoint once and only redirects after a confirmed end (or an already-expired session). Failures remain visible and do not claim logout. It clears in-memory scope and the session cookie, not banking data, saved applicants, command receipts or per-customer original-outcome recovery storage.
- Switch customer remains an explicit demo action. It must never reset accounts, balances or another customer's records. Existing synthetic onboarding remains intact.

## Boundaries

No Core writes, financial retry, migration, new identity provider, production-auth claim, repository visibility change or new agent. Preserve role checks and original-command recovery. Radix menu supplies keyboard focus, typeahead, Escape, outside dismissal and collision handling, consistent with existing Radix controls.

## Acceptance

Rendered regression checks cover active-session public home with no banking requests; explicit entry/resume; profile selection, website navigation, menu keyboard/focus/mobile/large text; successful logout, failed logout and expired session; reload/Back after logout, bookmarked re-entry and selection; pending-original storage retained and no financial POST from entry/exit. Existing whole-workspace and onboarding/recovery checks remain meaningful with explicit banking entry URLs. Exact-branch full CI, private PR, serialized native release and managed-browser proof follow repository policy.

## Ownership

Beads of-h8d owns execution. Finacle5 implements in its exclusive1804 worktree. Evidence explicitly transferred the shared-file, canonical, release and managed-browser leases after verified PR108 acceptance. README of-as0 is complete and its native proof is recorded independently. Preserve the transfer owner's released PR105 regression and all existing banking recovery behavior.
