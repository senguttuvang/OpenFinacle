# ICICI menu reconstruction

Execution: `of-9hc.19`. Owner: Finacle8. Integration and production release: Finacle5.

## Source and bounded coverage

On 18 October 2026, inspected the authenticated `retailnetbanking.icici.bank.in` desktop left rail in the exact browser the user authenticated. [source-inventory.json](source-inventory.json) records all nine visible primary families and 44 child entries, with source IDs, order, depth, parent, trigger, state, confidence, gates and container dimensions. Whitespace is normalized; capitalization and wording are preserved. The hidden alternate navigation was excluded. Earlier discovery in spec006 does not establish current menu parity.

Normal Playwright hover opened every primary family. Waiting for the menu to settle was necessary: the bank reuses child data, and immediate reads initially showed the previous family's entries. Those transient reads were discarded. Every child was hovered separately; no third-level list, expander or additional hover panel appeared. Each settled fly-out had equal client and scroll heights; no clipped extra entries were inferred absent. Counts by family: Overview 3, Accounts 4, Payment & Transfer 6, Deposits 4, Cards 3, Loans 3, Investments 8, Insurance 6, Customer Service 7.

Primary click was verified only for Payment & Transfer; it preserved the open fly-out. Other source click behavior, keyboard behavior, narrow-screen behavior, target routes and destination entitlement gates were not inspected. Destination anchors expose no href. Targets are deliberately null rather than inferred routes. Logout was not found among anchors/buttons in the bounded check and was never invoked; profile/header menus and other global navigation are outside this left-rail inventory. This is complete coverage of the observed rail, not every bank page or global action.

No destination page, personal details, balance, account identifier, cookie, storage or network body was collected. The user's full screenshot remains private and is not copied into this repository. No banking instruction was submitted. The bank browser remains running; authentication is not guaranteed during implementation pauses.

## Design and behavior

Extend the approved OpenFinacle light/cobalt/mint design, local fonts and 18/22px reading controls. Retain product branding, customer selection and journey separation. Use a left primary rail and adjacent fly-out on desktop, with inline nested disclosures on narrow screens. Preserve both hierarchy levels rather than flattening the 44 entries. Native list/disclosure semantics suit navigation; these are not application command-menu roles.

Mouse hover opens a family above 900px; click and Enter toggle it. Arrow Up/Down and Home/End move between families or between child entries; Arrow Right enters the child list; Arrow Left and Escape close it and return focus. Outside pointer, leaving the rail/panel, and leaving keyboard focus dismiss the fly-out. Touch uses an explicit Banking menu disclosure and family buttons. Busy state disables destination selection. Panels scroll within the viewport, and labels wrap at large text/narrow widths.

## Destination contract

`src/domain/retail-navigation.ts` owns ordered source labels and typed internal destination decisions. It imports no UI, HTTP, storage or banking engine. `app/retail-navigation.tsx` owns disclosure/focus behavior and an explicit unavailable-service destination. No menu item links to the reference bank.

Supported targets reuse overview, account enquiry, customer profile, transfers, fixed/recurring deposits, lending, service requests and planning. Planning mappings describe the synthetic planning workspace rather than a live account aggregator. Credit/forex/prepaid cards, investment execution, insurance, international remittance, bills, tax and other unsupported products open a deliberate availability panel. Related supported workspaces are offered as separate actions; they are never presented as fulfillment of the unavailable service.

Existing statements, debit-card controls, account opening, planning and staff navigation must remain reachable. Customer picker, scoped headers, customer subtree remounts, roles, onboarding and all persisted history must remain intact. Deep-linking to recurring deposits must select the recurring product without submitting any action. No backend or schema change is in scope.

## Verification and integration boundary

The isolated `/navigation-preview` harness never opens an API workspace. Unit tests compare the source capture with the menu hierarchy, unique IDs and destination safety. The dedicated Playwright configuration uses only port3098; browser tests check every family and child destination, keyboard/focus/dismissal, busy controls, mobile390, extra-large text and a720px reflow equivalent to a1440px desktop at200%zoom. Browser-native zoom is a separate verification boundary and must not be claimed from the reflow test alone.

Full application integration requires Finacle5's explicit shared-file lease and fresh agreed source, then local application browser proofs preserving customer/journey/staff behavior. Production proof and release remain with Finacle5. The final verification record must distinguish isolated component tests, integrated fixture tests and native production evidence.
