# Single-screen estimator comparison

Research and implementation date: 18 October 2026. Beads: of-kup. Preview: `/build-estimator-preview`. This supplements the existing spec without changing its canonical engine or the existing magazine entry.

## Decision and comparison basis

Bank decision-makers need to see the scope, assumptions and consequences together. Team A remains human-led/light AI; Team B remains AI-first with human direction/review. Both use identical selected modules, reference effort, salary rates, working calendar and core-reuse premise. Talent compositions remain independently adjustable. The main view exposes planned people INR and API USD separately, human allocation, modelled reference work, elapsed range and fit to the planning window. Completion budgets remain inspectable separately from window allowances. No exchange rate is assumed.

Finacle occupies a clearly labelled commercial-reference column. The reviewed primary sources do not establish a bank-specific acquisition/run price or audited lifetime development total. A historical Finacle 10 anchor is version-specific and carries no comparison ratio to the application slice. There is no vendor saving, feature-parity claim or replacement recommendation.

Prototype reproduction selects accounts/payments, customer/branch and deposits/cards on an existing core such as Apache Fineract. These are planning categories, not a statement that every associated capability is delivered. Live rails, KYC/AML, migration, assurance and bank operations are excluded. Pilot foundations adds reconciliation and security/operations model categories plus the canonical expert controls; bank-specific acceptance and integrations remain excluded. A production-bank program has no numerical delivery estimate: discovery, independent workstreams, external dependencies and acceptance evidence are missing. It does not reuse pilot coefficients as a production estimate.

The founder's one-week/500M-token prototype account remains self-reported and unaudited, and does not calibrate productivity. Household planning is synthetic; chatbot/MCP and full wealth execution remain roadmap. Tokens alone never change effort or readiness.

## Research evidence and rationale

Two complementary surfaces were used: direct primary-page retrieval through web search tooling and focused Exa search for calculator design/assumption precedents. The supplied Plane screenshot was inspected in full.

- [Plane pricing and savings calculator](https://plane.so/pricing): member count, selected tool plans and adjacent annual totals keep input/output context together. Adopt the compact left-input/right-result structure, explicit units and immediately visible comparison basis. Do not reuse branding or the 70% promotional claim. Unlike per-seat SaaS substitution, building on an existing banking core does not have equal product scope to acquiring Finacle.
- [AWS Pricing Calculator](https://calculator.aws/) and [official assumptions](https://aws.amazon.com/calculator/calculator-assumptions/): configurable usage with grouped totals and inspectable arithmetic. Estimates depend on declared inputs and omissions, and are not quotes. Adopt visible window/scope boundaries and a calculation disclosure. A cloud resource catalog or generic estimation platform is unnecessary here.
- [Finacle core banking](https://www.finacle.com/solution/core-banking-solution/): broad commercial product context; reviewed page did not provide a bank-specific acquisition/run price.
- [Finacle 10 announcement, 20 February 2008](https://www.finacle.com/news-room/press-release/finacle-infosys-unveils-finacle-10-next-generation-solution-banking-transformation/): reports over 240,000 person-days for that version and over US$60M invested in the preceding three years. Neither is lifetime payroll, a current licence price or the effort to build this selected application slice. UI uses only the person-day anchor, explicitly separated from the A/B estimates.
- [Official OpenAI API pricing](https://developers.openai.com/api/docs/pricing) and [GPT-6.1 Sol model](https://developers.openai.com/api/docs/models/gpt-6.1-sol), checked 18 October 2026: standard short-context fresh input US$2/M, cached input US$0.10/M and output US$10/M agree with the canonical snapshot. No provider calls or purchases. A/B defaults assume 10%/20% output respectively; cache reads/writes zero. Advanced controls expose output/cache-read mix. Subscription pricing is separate. One focused Exa query was used; no broad paid crawl.

A ready-made savings widget would impose unsupported comparable plans and vendor prices; a custom presentation on the existing model best preserves the banking-specific evidence boundaries without introducing a new calculation engine or dependency.

## Design and implementation contract

Intent: a bank decision-maker should understand what is budgeted and what remains unknown. Hierarchy: prominent A/B people budgets and separate API allowances, then effort/duration/fit, with shared scope above. Signature: a commercial reference alongside two equal delivery scenarios, with honest non-comparability stated in the reference column. Palette/typography reuse the established navy/cobalt, pale workspace, Manrope and IBM Plex Sans. Quiet borders, four-pixel spacing rhythm and compact controls provide desktop density; native disclosures contain advanced assumptions. Shared Radix FormSelect preserves keyboard selection and focus return.

New code owns only `src/site/build-estimator/`, `app/build-estimator-preview/`, `e2e/build-estimator/`, `tests/build-estimator-scenarios.test.ts` and this supplement. Imports of canonical `app/build-recipe-model.ts` and `app/form-select.tsx` are read-only. PR110's moved destinations are `src/site/build-story/build-recipe-model.ts` and its shared form component; integration requires the explicit owner lease and current paths, never a duplicate engine or compatibility alias. No existing estimator, route, shared CSS, root metadata or open-source preparation file is edited.

Acceptance: at 1440×900, common basis, selected scope, key inputs, all three entities, principal budgets and effort explanation fit together; mobile and 200% text reflow with no horizontal page overflow. A/B share the same denominator. Token changes affect cost only. Empty teams and missing AI budget block delivery, expertless pilots stay blocked, and production has no numerical range. The focused browser suite is loopback-only and rejects API/external requests. No banking data or provider state is involved.

## Verification and integration

Start locally: `bunx next dev -p 8810 --hostname 127.0.0.1` (verify the port is free first). Browser proof: `ESTIMATOR_ARTIFACTS=<absolute-existing-directory> bunx playwright test -c e2e/build-estimator/preview.config.ts`. Unit contract: `bun test tests/build-estimator-scenarios.test.ts`. Full CI equivalent: `bun run check`, as specified in `.github/workflows/ci.yml`. Evidence and final limitations are recorded in Beads and the private PR.

Existing shared integration is deferred pending a file lease. This route is deliberately isolated, unlinked from production navigation and marked noindex. Merge, deployment, banking/Core mutations and existing managed browser use are outside this owner's authority.
