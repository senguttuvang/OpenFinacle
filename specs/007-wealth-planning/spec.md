# Wealth and Planning

Owner: Finacle5; epic of-i38. Status: authorized synthetic capability, separate from banking records. Anchor: 17 October 2026. All names, amounts, merchants and holdings independently invented. No private bank research or personal finances inform these fixtures.

## Journeys and acceptance

1. Select one of four illustrative Indian households. See total versus liquid/investable wealth, ownership, dated sources, allocation and history. Joint assets are counted once. Home and locked retirement assets are excluded from available capital.
2. Filter recorded cash flow by dates (30/90 days, month, quarter, Indian FY, prior FY, all/custom), account, member, category and merchant. Every total, trend and transaction detail uses the same selected postings. Compare preceding equal calendar-day windows with partial-coverage disclosure. Transfers/card settlements are excluded from consumption; refunds reduce original category spending; SIPs are investment flows; EMI principal and interest are distinct.
3. Inspect budgets, commitments and a deterministic 90-day forecast anchored after the dataset date. Future entries are assumptions, never posted transactions. Edit budgets and acknowledge explainable alerts.
4. Inspect/edit/duplicate/save/delete versioned scenarios separately from actual holdings. Compare deterministic annual projections against baseline in today's or nominal rupees, with annual inflows, spending, debt, goal costs, asset shortfall and year of depletion. No invented success probability, return performance or tax certification.
5. Household owners may edit. Adviser review requires explicit household-specific consent and is read-only; teller/approver sessions have no implied planning permission. Server guards protect relationship, versions, command identity and audit.

## Domain contracts and arithmetic

Currency INR; integer paise for every money value, safe integer validation at inputs; rates integer basis points. Round each defined annual/monthly accrual once to paise. Dates ISO calendar days, inclusive ranges; Indian FY starts April 1. Synthetic balances reconcile opening balances plus signed postings per account; liabilities and investment valuations are separate dated snapshots, never implied core postings.

Consumption = expense and loan-interest debits minus expense refunds. Cash movement includes investment purchases and loan principal; internal transfers sum to zero across accounts. Salary is net of withholding; professional household includes explicit estimated tax reserve, not a tax-law engine. No XIRR until eligible dated investment valuations and external flows support one.

Projection model v1: start with liquid plus investable assets, excluding home/locked assets. Each annual step computes income until retirement, later pension/rent, separately inflated essential/discretionary costs, dependent costs and dated one-off goals/shocks; debt amortizes monthly with EMI split; investments earn (return minus fee) on opening assets. Income minus all cash outflows plus growth updates assets. Deficit is recorded explicitly; negative assets are not silently funded. Inflation deflates amounts at each year-end for today's rupees. Contributions/SIP are a transfer of cash into the modeled investment pool: they are not an additional invented source of wealth. SIP step-up reallocates surplus and only increases wealth through a specified investment-return differential. Adverse sequence overrides early retirement returns; job breaks remove income in specified years. Prepayment uses existing investable capital and reduces principal, never both increases investment and lowers debt for free.

## Persistence and permissions

Preview may start with explicitly labeled device-only persistence while shared integration is leased. That is not final server persistence. Final state belongs to D1 with initialize-once synthetic setup, versioned snapshots, command replay mismatch protection, immutable audit and household relationship/role guards. No per-visit reseeding. Unsupported versions fail visibly. No actual Fineract record changes, payments, notifications or advice execution.

## Evidence and boundaries

User handoff of 17 October 2026 is implementation authority. Current app PRODUCT/DESIGN and architecture decision002 govern implementation. Public products named in the brief inspire capability families; no authenticated competitor testing, India integration coverage or proprietary field parity is claimed. Fixture costs and return/inflation assumptions are illustrative, inspectable inputs. Financial-year tax rules and stochastic simulation remain excluded until separately specified and validated.

## Verification

Behavioral tests exercise reconciliation, paired transfers/card settlements/refunds, FY/date/filter detail consistency, debt prepayment and zero-rate arithmetic, retirement depletion and inflation, persistence versions/ownership/idempotency. Own production-export preview: desktop, 390px, keyboard and extra-large text; existing workspace suite and full exact-branch check before merge. Finacle4 owns serialized shared integration/migration/deployment until handover acknowledged. Epic closes only after server persistence, integration, reviewed release and live verification.
