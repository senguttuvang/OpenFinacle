# Production Capability Roadmap

This roadmap defines OpenFinacle's banking products, capabilities and operating workflows. It maps 162 scoped capabilities to Beads owners and recommends one bounded production repayment release. These are planned capabilities; delivery dates, provider selection and live operation require separate acceptance.

## Product Direction And Sequence

- **Portfolio owner:** `of-1m2`; scope-capture task `of-1m2.1`. Beads owns execution; this document owns product scope.
  - **Current baseline:** selected core-connected prototype journeys, persistent simulations and one protected savings-funded lending pilot. No listed family has independent production acceptance.
  - **Recommended first release:** `of-1m2.19` — one scheduled repayment of an existing INR personal loan for one regulated lender and one approved external collection route.
  - **Planning status:** proposed recommendation; lender, product policy, payment provider, accounting acceptance and launch approvals remain unresolved.
- **Foundation sequence:** institution/policy contract → core/funding fit → production identity and durable processing → collection/core posting → customer receipts and reconciliation → exceptions, assurance and lender UAT → expressly authorised live pilot.
  - **Next expansion:** complete servicing and closure for the selected loan product, then evaluate origination or another product against actual institution demand.
  - **Later:** liabilities, secured lending, additional rails, cards, cooperative-specific and specialist banking. No wholesale-bank rebuild is implied.
  - **Decide rather than duplicate:** build the differentiated workflow, reuse verified core rules, integrate regulated networks and established enterprise systems, and leave unselected scope deferred.
- **Production boundaries:** [first-slice specification](../specs/015-production-repayments/spec.md) and [dependency plan](../specs/015-production-repayments/plan.md).
  - **Funding distinction:** externally collected money must not be fed to the existing savings-withdrawal-plus-loan-repayment adapter. A separately verified posting/accounting contract prevents a second debit.
  - **Customer protection:** accepted-funds recognition, posting and settlement remain separately traceable with approved value dates and exception resolution.

## Capability Register

Each stable capability ID below is included in its Beads owner's explicit scope. The tickets are discovery/delivery containers; acceptance-ready children are split when selected. Describing a family as core-backed or simulated characterises the existing prototype only. Items grouped under an owner are not claims that every sub-capability has been implemented.

### FND

- **Financial and platform foundations** — execution owner `of-1m2.2`.
  - **Current boundary:** Selected financial commands, audit and recovery patterns exist; production acceptance is outstanding.
  - **Approach:** Reuse and harden. **Sequence:** Foundation for first slice.
  - **Captured capabilities:**
    - **FND-01 — Institution, legal-entity, branch and tenant isolation.**
    - **FND-02 — Customer, account and product identifiers with explicit ownership.**
    - **FND-03 — Versioned product rules, currencies, calendars and effective dates.**
    - **FND-04 — Authoritative core ledger, chart of accounts and subledger-to-GL mappings.**
    - **FND-05 — Exact money, interest, fees, payment allocation and tax rule acceptance.**
    - **FND-06 — Durable commands, idempotency, concurrency and original-outcome recovery.**
    - **FND-07 — Reliable event inbox/outbox and cross-system correlation.**
    - **FND-08 — Immutable financial audit with named human/service actors.**
    - **FND-09 — Bank-approved end-of-day and scheduled processing.**
    - **FND-10 — Configuration governance and independent approvals.**

### CUS

- **Customer identity, onboarding and documents** — execution owner `of-1m2.3`.
  - **Current boundary:** Persistent customer directory and staged synthetic onboarding exist; verification and identity are simulated.
  - **Approach:** Reuse workflows; integrate identity and verification. **Sequence:** First-slice authentication first; broader onboarding later.
  - **Captured capabilities:**
    - **CUS-01 — Customer information and relationship management.**
    - **CUS-02 — Production customer authentication, MFA/2-FA and session lifecycle.**
    - **CUS-03 — Staff identity, least privilege and segregation of duties.**
    - **CUS-04 — Account ownership, delegates and revocable consent.**
    - **CUS-05 — Document management, retention and controlled access.**
    - **CUS-06 — KYC, e-KYC document validation and periodic review.**
    - **CUS-07 — Aadhaar/PAN verification through eligible providers.**
    - **CUS-08 — Bank-account verification and collection-account binding.**
    - **CUS-09 — Sanctions, AML, fraud monitoring and response ownership.**
    - **CUS-10 — Privacy, data minimisation, retention and customer rights.**
    - **CUS-11 — Self-service onboarding, application review and actual core account activation.**
    - **CUS-12 — Customer directory, relationship overview, profile and alert preferences.**

### DEP

- **Liability products and deposit servicing** — execution owner `of-1m2.4`.
  - **Current boundary:** Selected savings flows are core-backed; FD/RD holdings and advice are persistent simulations.
  - **Approach:** Reuse core where fit; implement verified product lifecycles. **Sequence:** After repayment foundation.
  - **Captured capabilities:**
    - **DEP-01 — CASA savings accounts.**
    - **DEP-02 — CASA current accounts and account preferences.**
    - **DEP-03 — Fixed/term deposits with actual funding.**
    - **DEP-04 — Recurring deposits with actual instalment funding.**
    - **DEP-05 — Deposit interest accrual, posting and rate changes.**
    - **DEP-06 — Maturity, payout and renewal.**
    - **DEP-07 — Premature closure and penalties.**
    - **DEP-08 — Nominees and survivorship instructions.**
    - **DEP-09 — Standing instructions and sweeps.**
    - **DEP-10 — Dormant-account classification and reactivation.**
    - **DEP-11 — DEAF/unclaimed-deposit processing.**
    - **DEP-12 — Deposit certificates, advice and tax statements.**
    - **DEP-13 — Account enquiry, balances, transaction history and statement export.**
    - **DEP-14 — External account aggregation with explicit customer consent.**
    - **DEP-15 — Goal-based deposits and product-specific servicing.**

### LEN

- **Asset products, origination and servicing** — execution owner `of-1m2.5`.
  - **Current boundary:** Personal-loan origination and one protected savings-funded repayment pilot exist; ordinary repayment UI and full servicing remain incomplete.
  - **Approach:** Reuse bounded core integration; specify each product. **Sequence:** Existing-loan repayment first; new products later.
  - **Captured capabilities:**
    - **LEN-01 — Personal/unsecured term-loan product.**
    - **LEN-02 — Home loans and construction-linked lending.**
    - **LEN-03 — Vehicle loans and dealer-linked finance.**
    - **LEN-04 — Business/SME term loans.**
    - **LEN-05 — Overdrafts and revolving credit.**
    - **LEN-06 — Microfinance and household affordability rules.**
    - **LEN-07 — LOS application, underwriting and decision records.**
    - **LEN-08 — Product-specific eligibility, income, bureau and fraud checks.**
    - **LEN-09 — Collateral registry, valuation, legal checks and security perfection.**
    - **LEN-10 — Disbursement conditions, tranches and destination verification.**
    - **LEN-11 — Loan schedules, interest, charges and statements.**
    - **LEN-12 — Repayment, delinquency and collections.**
    - **LEN-13 — Payoff, prepayment, closure and security release.**
    - **LEN-14 — Restructuring, one-time settlement, write-off and recovery.**

### PAY

- **Payments, collection and settlement integrations** — execution owner `of-1m2.6`.
  - **Current boundary:** Internal INR transfers are core-backed; external rails, settlement and operational reconciliation are not delivered.
  - **Approach:** Integrate rails; own orchestration and reconciliation. **Sequence:** One approved collection rail first; expand later.
  - **Captured capabilities:**
    - **PAY-01 — Internal own-account and beneficiary transfers.**
    - **PAY-02 — Customer-owned payee management.**
    - **PAY-03 — NEFT integration.**
    - **PAY-04 — RTGS integration.**
    - **PAY-05 — IMPS integration.**
    - **PAY-06 — UPI and merchant QR integration.**
    - **PAY-07 — BBPS bill payment and recharge integration.**
    - **PAY-08 — Payment gateway and bank collection integration.**
    - **PAY-09 — AEPS integration.**
    - **PAY-10 — NACH/ACH/e-NACH mandates through eligible sponsor arrangements.**
    - **PAY-11 — CTS cheque clearing and Positive Pay.**
    - **PAY-12 — SWIFT and cross-border payment integration.**
    - **PAY-13 — Clearing, settlement and gross/net-fee reconciliation.**
    - **PAY-14 — Returns, reversals, disputes and refunds.**
    - **PAY-15 — Scheduled payments, mandate cancellation and recurring instructions.**
    - **PAY-16 — Tax payments, FASTag and remittance destinations.**
    - **PAY-17 — Salary and bulk payment instructions.**

### OPS

- **Branch and head-office operating workflows** — execution owner `of-1m2.7`.
  - **Current boundary:** Selected teller, approval, restriction and reversal workflows exist; complete branch/head-office operation is not established.
  - **Approach:** Reuse selected controls; extend bank-specific operations. **Sequence:** Repayment exception operations first; branch expansion later.
  - **Captured capabilities:**
    - **OPS-01 — Teller cash receipt and payment.**
    - **OPS-02 — Cash positions, vault and teller handover.**
    - **OPS-03 — Maker/checker queues with real staff identities and limits.**
    - **OPS-04 — Transaction enquiry and controlled reversal.**
    - **OPS-05 — Attachment, debit freeze, lien and stop instructions.**
    - **OPS-06 — Interbranch accounting and reconciliation.**
    - **OPS-07 — Branch start-of-day and end-of-day.**
    - **OPS-08 — Unresolved work, operational queues and audit enquiry.**
    - **OPS-09 — Product, interest, fee and reference administration.**
    - **OPS-10 — Head-office consolidated operations and management oversight.**

### CRD

- **Cards and device integrations** — execution owner `of-1m2.8`.
  - **Current boundary:** Synthetic debit-card controls and replacement histories exist; there is no issuer, network or physical delivery integration.
  - **Approach:** Integrate issuers/processors and fulfilment. **Sequence:** Later.
  - **Captured capabilities:**
    - **CRD-01 — Debit-card issuing, controls and lifecycle.**
    - **CRD-02 — Credit-card billing, payment, interest and servicing.**
    - **CRD-03 — Prepaid and forex cards.**
    - **CRD-04 — Card replacement, PIN and physical fulfilment.**
    - **CRD-05 — ATM integration.**
    - **CRD-06 — POS and e-commerce processing.**
    - **CRD-07 — QR-based smart cards.**
    - **CRD-08 — Pigmy POS and field-device integration.**
    - **CRD-09 — Card rewards, credit limits and billing-cycle enquiries.**

### CHN

- **Digital channels and customer communications** — execution owner `of-1m2.9`.
  - **Current boundary:** Responsive browser portal and accessible routes exist; bank-grade identity, native/field channels and communication integrations are outstanding.
  - **Approach:** Reuse web experience; integrate delivery channels. **Sequence:** Repayment browser journey and receipts first.
  - **Captured capabilities:**
    - **CHN-01 — Internet banking with production identity.**
    - **CHN-02 — Mobile banking application.**
    - **CHN-03 — Tablet/tab banking.**
    - **CHN-04 — Field-agent and Pigmy collection application.**
    - **CHN-05 — Biometric authentication and device assurance.**
    - **CHN-06 — SMS delivery, push/pull messages and short URLs.**
    - **CHN-07 — Email delivery and notification preferences.**
    - **CHN-08 — One-way/two-way WhatsApp integration.**
    - **CHN-09 — Missed-call services and IVRS.**
    - **CHN-10 — Low-bandwidth, interrupted-network and accessibility acceptance.**

### SVC

- **Service centre and customer maintenance** — execution owner `of-1m2.10`.
  - **Current boundary:** Twenty-four request-led forms and shared case history exist; complete service/product effects and external fulfilment remain incomplete.
  - **Approach:** Reuse existing case engine; complete product effects. **Sequence:** Repayment support first; broader scope later.
  - **Captured capabilities:**
    - **SVC-01 — Customer requests, complaints and help-desk ticketing.**
    - **SVC-02 — Request-specific validation, review and tracking.**
    - **SVC-03 — Approved customer/profile maintenance.**
    - **SVC-04 — Cheque book, demand draft and physical deliverable fulfilment.**
    - **SVC-05 — Transaction disputes, evidence and customer escalation.**
    - **SVC-06 — Mailbox, security controls and linked-account/policy service.**

### COO

- **Cooperative and physical-branch specialist products** — execution owner `of-1m2.11`.
  - **Current boundary:** Dedicated production implementation and acceptance remain outstanding.
  - **Approach:** Discover fit and implement only for selected institution. **Sequence:** Institution-specific later scope.
  - **Captured capabilities:**
    - **COO-01 — Cooperative membership and share capital.**
    - **COO-02 — Locker allocation, access and billing.**
    - **COO-03 — Pigmy/small-savings collection and agent settlement.**
    - **COO-04 — Dead-stock and branch inventory management.**

### TAX

- **Taxation and regulatory reporting** — execution owner `of-1m2.12`.
  - **Current boundary:** No accepted jurisdiction-specific tax engine or statutory reporting pack is established.
  - **Approach:** Integrate or configure with accountable finance/compliance owners. **Sequence:** First-slice applicable obligations first; full pack later.
  - **Captured capabilities:**
    - **TAX-01 — TDS calculation, deduction, remittance and reporting.**
    - **TAX-02 — GST treatment, invoices and reporting.**
    - **TAX-03 — Statutory/regulatory reports and submission controls.**
    - **TAX-04 — Business/MIS reports with reconciled definitions.**
    - **TAX-05 — Custom reports with access control and lineage.**
    - **TAX-06 — Risk-based internal audit and evidence management.**

### GOV

- **Government schemes and external service interfaces** — execution owner `of-1m2.13`.
  - **Current boundary:** Broad destinations are recorded; provider contracts and production interfaces remain unestablished.
  - **Approach:** Integrate eligible institutions and providers. **Sequence:** Later.
  - **Captured capabilities:**
    - **GOV-01 — Government savings schemes and subsidies.**
    - **GOV-02 — PFMS integration.**
    - **GOV-03 — LIC and insurance-service interfaces.**
    - **GOV-04 — CBDT and tax-service interfaces.**
    - **GOV-05 — Cheque-book personalisation interface.**

### TRD

- **Treasury, trade and specialised banking** — execution owner `of-1m2.14`.
  - **Current boundary:** These capabilities are not implemented as OpenFinacle production modules.
  - **Approach:** Evaluate specialist cores/integrations before custom work. **Sequence:** Later; separate business cases.
  - **Captured capabilities:**
    - **TRD-01 — Bank investment portfolio and government securities.**
    - **TRD-02 — Treasury positions, valuation, liquidity and settlement.**
    - **TRD-03 — Foreign exchange products and positions.**
    - **TRD-04 — Letters of credit.**
    - **TRD-05 — Bank guarantees and non-fund-based exposures.**
    - **TRD-06 — Trade finance, documents and settlement.**

### WLT

- **Wealth, investments and insurance** — execution owner `of-1m2.15`.
  - **Current boundary:** Synthetic household planning exists; investment execution, custody and regulated advice are not delivered.
  - **Approach:** Reuse planning; integrate regulated services separately. **Sequence:** Later.
  - **Captured capabilities:**
    - **WLT-01 — Household cash flow, budgets and spending analysis.**
    - **WLT-02 — Goals, retirement projections and saved scenarios.**
    - **WLT-03 — Consent-scoped adviser review.**
    - **WLT-04 — Mutual funds, securities/demat and retirement product interfaces.**
    - **WLT-05 — Market data, suitability and advice controls.**
    - **WLT-06 — Order execution, custody, settlement and reconciliation.**
    - **WLT-07 — Insurance policy maintenance, linking and servicing.**

### ORG

- **Internal organisation and administration** — execution owner `of-1m2.16`.
  - **Current boundary:** Complete organisational systems are not part of the delivered banking prototype.
  - **Approach:** Prefer integration with established enterprise systems. **Sequence:** Later; integrate where needed.
  - **Captured capabilities:**
    - **ORG-01 — HRMS and staff lifecycle integration.**
    - **ORG-02 — Payroll integration.**
    - **ORG-03 — Internal role/access administration and audit logs.**
    - **ORG-04 — Business-process automation and automatic data flow.**

### RUN

- **Security, resilience, migration and managed operation** — execution owner `of-1m2.17`.
  - **Current boundary:** Demo deployment, telemetry and protected workflow backup tooling exist; institution production acceptance is outstanding.
  - **Approach:** Harden and independently verify. **Sequence:** First-slice requirements before live launch.
  - **Captured capabilities:**
    - **RUN-01 — Production environment/data/secret isolation.**
    - **RUN-02 — Threat modelling, security testing and vulnerability response.**
    - **RUN-03 — Measured capacity, latency, availability and service objectives.**
    - **RUN-04 — High availability, disaster recovery and dedicated DR where required.**
    - **RUN-05 — Verified backup/restore with agreed RTO/RPO.**
    - **RUN-06 — Legacy master/customer/loan data migration and lineage.**
    - **RUN-07 — Opening balances, GL configuration and reconciled parallel runs.**
    - **RUN-08 — Access configuration, staff training and UAT sign-off.**
    - **RUN-09 — Controlled cutover, rollback and post-go-live monitoring.**
    - **RUN-10 — Incident response, support ownership and on-call coverage.**
    - **RUN-11 — Applicable CERT-In, ISO, PCI-DSS, STQC and IDRBT assurance evidence, with applicability and scope independently determined.**
    - **RUN-12 — Managed SaaS tenancy, data residency and service contracts.**
    - **RUN-13 — Provider/sponsor agreements, fees and change/continuity dependencies.**
    - **RUN-14 — Usage metering, API/module pricing and customisation/service scope.**

### AI

- **AI and consented banking access** — execution owner `of-1m2.18`.
  - **Current boundary:** Customer chatbot, customer MCP delegation and bank projections are proposals; no production acceptance is established.
  - **Approach:** Evaluate and implement after financial/identity foundations. **Sequence:** Later.
  - **Captured capabilities:**
    - **AI-01 — Grounded banking support chatbot with escalation and evaluation.**
    - **AI-02 — Customer-controlled MCP/tool access with revocation and financial confirmation.**
    - **AI-03 — AI/ML projections with provenance, evaluation and human controls.**

### PFM

- **Everyday financial intelligence and commitments** — execution owner `of-9py`.
  - **Current boundary:** Existing future-scope ticket remains open and deferred; do not duplicate or resume it implicitly.
  - **Approach:** Reuse existing planning model. **Sequence:** Later.
  - **Captured capabilities:**
    - **PFM-01 — Private transaction notes and links.**
    - **PFM-02 — Informal lending, borrowing, gifts and partial repayment records.**
    - **PFM-03 — Inferred subscriptions and recurring commitments.**
    - **PFM-04 — Expected refunds, reimbursements and deposits.**
    - **PFM-05 — Available-to-spend cash outlook.**
    - **PFM-06 — Annual expense reserves.**
    - **PFM-07 — Consent-scoped household/shared expenses.**
    - **PFM-08 — Investment commitment calendar.**
    - **PFM-09 — Payday allocation proposals.**
    - **PFM-10 — Monthly financial review.**

## Existing Delivery Records

- **Preserve historical scope:** `of-9hc` (retail/branch reconstruction), `of-9hc.1` (service centre), `of-9hc.15` (personal lending) and `of-9hc.15.12` (savings-funded repayment).
  - **No automatic promotion:** those tickets retain their original evidence, status, priorities and deferred-expansion notes. Production scope has distinct owners above.
  - **Existing future scope:** PFM capabilities reuse `of-9py`; do not create a second money-life backlog or resume it implicitly.
  - **Existing maintenance:** `of-pq6`, `of-i1i` and `of-0sx` remain separate; roadmap capture does not close them.

## Scope Interpretation And Gates

- **Product families:** liability products include savings/current/FD/RD; asset products include personal/home/vehicle/business lending. Customer records, product rules, ledger/accounting, identity, compliance and operations span both. Payments and fee-based services do not all fit into those two product lines.
  - **Different institution types:** a lending platform need not own a deposit business. A small institution still needs correct accounting, authorization, recovery and operational ownership.
  - **Lending workflow differences:** home/vehicle products require specific eligibility, collateral/legal/valuation, disbursement and security-release contracts; adding a product label is insufficient.
- **Provider integrations and operations:** rails, identity checks, networks, physical fulfilment, migration and support need accepted dependencies and service contracts.
  - **Assurance applicability:** select the actual jurisdiction/institution obligations and relevant standards with competent owners; listing a certification name does not make it universally required or achieved.
- **Completion:** for selected scope, approve business rules, identities, ownership, state transitions, financial effects, failure/recovery, accessibility, support and independent acceptance.
  - **Do not close on appearance:** menus, API availability, synthetic records, successful fixtures and a single pilot each establish limited evidence.
  - **No schedule promise:** unresolved external dependencies remain explicit decision gates; date/cost estimates require the selected lender and delivery team.
