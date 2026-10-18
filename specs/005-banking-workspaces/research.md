# Portal and UI assessment — 2026-10-17

## Observed evidence and limits

A read-only walkthrough of ICICI retail net banking informed the navigation assessment. No transaction, beneficiary, approval or service submission was performed. No account identifiers, balances, credentials, response bodies or bank screenshots were retained as project assets.

Observed retail product families: overview, accounts, payments/transfers, deposits, cards, loans, investments, insurance and customer service. Secondary overview navigation exposes My View, Personal Details and Know your spends. The page uses Mulish, compact horizontal navigation, portfolio surfaces and account-detail shortcuts. Accounts expose Bank Accounts, View Account Details and View All Accounts; payments expose Funds Transfer, Pay Bills, Tax Center and Wire Transfer. Passive navigation generated GET and POST requests; method alone does not identify a banking mutation. No authenticated API was replayed, and response schemas remain unverified.

Retail access provides no evidence of ICICI's staff portal. Staff capability families instead come from the owner's Finacle notes in the supplied Downloads export and existing implemented requirements. The operations note describes account enquiry, financial/nonfinancial verification queues, cash transactions, freeze/release, statements and service requests. Its menu codes are dated reference material, not proof of present proprietary behavior. Map only implemented demo capabilities.

## Portal Composition Principles

Use one application shell, explicit operational states, domain-shaped screens and actual totals. Custom administrative views should preserve navigation, forms, identity and access enforcement. These are implementation principles; no private project records, proprietary styles or authentication material are part of this repository's portal evidence.

## Alternatives and decision

Payload native admin saves work for editable documents, versioned records, permissions and conventional collections. Its custom views can accommodate specialist screens, but they need explicit authorization checks. OpenFinacle currently has a static Next client and an existing Effect/Worker workflow owner; adding Payload creates a new server runtime, identity and persistence boundary to operate. It would not supply teller posting logic or replace Fineract. Retain it as an option for a distinct content/document administration requirement.

React-admin offers dataProvider/authProvider boundaries and established list/edit screens over an existing API. It is suitable for a broad CRUD back office, but the current command-oriented API would need custom provider methods and many custom transaction pages. Combining it with native Payload admin duplicates shell and identity responsibilities. Do not stack them for visual polish.

Choose the existing React/Next workspace with maintained accessible primitives. Use cmdk (MIT) and its Radix Dialog integration for search, selection and focus; use local Fontsource fonts for consistent loading. The shadcn composition model is useful prior art, but importing an entire dashboard or adding Tailwind solely to restyle this established CSS app adds unnecessary migration work. Base UI and React Aria are credible alternatives; use one primitive family per interaction surface. Do not upgrade Next/React solely for appearance; the existing supported versions are already recent.

Primary sources consulted: [Payload custom views](https://payloadcms.com/docs/custom-components/custom-views), [native admin](https://payloadcms.com/docs/admin/overview), [React-admin data boundary](https://marmelab.com/react-admin/DataFetchingGuide.html), [cmdk](https://github.com/dip/cmdk), [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog), [shadcn command](https://ui.shadcn.com/docs/components/command), [Base UI combobox](https://base-ui.com/react/components/combobox), [React Aria table](https://react-aria.adobe.com/Table), [Fontsource Manrope](https://fontsource.org/fonts/manrope). The implementation assessment uses the current repository and the public primary sources listed above. These sources support composition and interaction choices, rather than proprietary portal internals.
