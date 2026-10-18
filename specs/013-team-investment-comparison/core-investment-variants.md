# Core-product investment: five design variations

The revised brief replaces the three-entity comparison with Finacle core investment vs one AI-first team. Review all five full-size interactive sections at `/build-estimator-variants`; do not promote a direction until the user chooses. Each section owns an independent scenario so different settings remain visible together. The user requested five sections rather than a single-variant picker. Existing primary UI is unchanged during this exploration.

## Scope and inference

The core experience covers accounts, deposits, internal payments, lending, ledger/reconciliation, maker-checker and operational handling. Apache Fineract remains the existing engine. Wealth management, card networks, external rails, bank migration/rollout and independent assurance are excluded. This is an experience/product-completion estimate, not a replacement ledger engine or accepted production core.

Finacle's [20 February 2008 announcement](https://www.finacle.com/news-room/press-release/finacle-infosys-unveils-finacle-10-next-generation-solution-banking-transformation/) reports release-wide investment above US$60M over three years and more than 240,000 person-days. It includes additional suite capabilities. No reviewed primary disclosure separates the core's investment or engineering headcount. The requested core-only inference assumes a 50% allocation: approximately US$30M and 120,000 person-days. Dividing by 3 years × 220 days gives approximately 182 full-time equivalents, displayed as roughly 180. A deliberately broad 35–70% allocation gives US$21M–42M and 127–255 equivalent people. The published amounts are lower-bound anchors; the allocation is a sensitivity scenario, not audited core expenditure, actual staffing, lifetime investment, or acquisition price. Historical dollars remain nominal; no parity/savings ratio is calculated.

Research checked 18 October 2026 using primary web retrieval and a focused Exa cross-check. No source establishes the allocation percentage; it is explicitly the estimator author's hypothesis. The comparison does not substitute deployment/outsourcing contract values for product development investment.

## AI-first planning arithmetic

Defaults: five full-time people, ten weeks, three Codex US$200/month accounts and one Claude US$200/month account. Two Codex accounts are one slider step away. Pay is an adjustable blended INR100,000/person/month assumption. Five days/week and eight hours/day give 250 person-days and 2,000 hours. Payroll = people × monthly pay × weeks × 12/52. No INR/USD conversion is inferred.

Accounts are whole-month subscriptions, not API tokens. Ten weeks requires three monthly billing periods: US$800/month × 3 = US$2,400. The exact five-month preset uses 65/3 weeks and five billing periods, costing US$4,000; it avoids the incorrect six-month bill caused by rounding five months to 22 weeks. Subscription-month ceiling tolerates floating point representation at exact month boundaries. Optional extra API allowance uses elapsed months rather than rounding to subscription billing periods; any included provider credits are not added to the cash budget a second time. Hosting, tax and other tools are excluded.

Verified [official Codex pricing](https://learn.chatgpt.com/docs/pricing) includes a US$200 Pro tier; included usage is workload-dependent, not a token entitlement. Verified [Claude Max pricing](https://support.claude.com/en/articles/11049741-what-is-the-max-plan) lists Max20x at US$200/month and describes usage limits. [Claude's pricing page](https://claude.com/pricing) also documents included API credits; the optional API slider represents spending beyond included allowances. No actual subscription purchase, API call, credit reset or authentication action occurs.

The delivery envelope reuses the canonical `calculateTeam` model, with one banking expert plus experienced developers filling the remaining full-time roles. Selected modules are accounts, branch, products, reconciliation, lending and operations. The generic products range reserves deposit/product work here, not card-network delivery. Under existing AI/review/coordination hypotheses, roughly 315–663 reference developer-days yields about 14–30 weeks for the default crew. These are conservative planning reservations for remaining completion, integration, rework and hardening, not a measured backlog burn-down. Subscription dollars are never passed into API pricing; an internal activity marker enables the canonical assistance hypothesis and its token/cost outputs are discarded. Account counts/API allowance do not scale productivity. Removing all assistance removes that drafting assumption.

Existing specifications/code establish working Fineract-backed accounts/postings, selected loans/deposits and customer/branch journeys. The founder's one-week/500M-token prototype account remains self-reported and unaudited. Neither tests passed, token totals nor elapsed calendar time measures actual engineering labor or calibrates production delivery. Ten weeks funds an initial slice; five months lies within the planning envelope. A bank program needs its own requirements, controls and acceptance.

## Five distinct directions

- Editorial: controls and a short story at left, historical and AI investments facing each other.
- Ledger: a direct comparison table; sliders occupy a separate narrow column.
- Workbench: dark control rail; the AI-team commitment dominates, with a compact historical reference strip.
- Timeline: existing foundation → next investment → coherent core experience, alongside sliders.
- Decision brief: proposal-style headline, horizontal controls and three short investment considerations.

All use the existing local Manrope/IBM Plex Sans, native range inputs, keyboard focus, explicit units and responsive stacking. Four sliders are visible: people, window, Codex accounts, Claude accounts. Pay/API controls share one disclosure. Shared evidence appears once below the variations. Each direction has a local selection button; it records discussion preference without changing the primary product.

## Verification and delivery boundary

Model checks: `bun test tests/core-investment.test.ts`. Browser checks: `ESTIMATOR_ARTIFACTS=<existing-directory> bunx playwright test -c e2e/build-estimator/core-variants.config.ts`. The browser suite rejects API/external requests and checks all five sections, independent presets, keyboard controls, costs, selection, mobile and real 200% text reflow. Full repository gate uses `DOCKER_HOST=unix:///Users/SenG/.colima/upwork-v2/docker.sock bun run check`.

This iteration owns new `src/site/core-investment/`, `app/build-estimator-variants/`, new browser/model tests and this supplement. Existing model and primary integration remain untouched. PR110 and PR112 files are preserved. No agents, merge or deployment. Publication remains held because the repository now reports public while the earlier private-PR request has not been clarified.
