/** Public, dated assessment data. No live balances or private customer information. */
export const assessmentDate = "18 October 2026";
const repository = "https://github.com/senguttuvang/OpenFinacle";
const baseline = "1d0b8a8f1256207573d9f14a82d2f523946bc8ef";
export const sources = {
  core: {
    title: "Finacle Core Banking",
    url: "https://www.finacle.com/solution/core-banking-solution/",
    kind: "Vendor product description · retrieved 18 Oct 2026",
  },
  digital: {
    title: "Finacle Digital Engagement",
    url: "https://www.finacle.com/solution/digital-engagement-suite/",
    kind: "Vendor product description · retrieved 18 Oct 2026",
  },
  wealth: {
    title: "Finacle Wealth Management",
    url: "https://www.finacle.com/solution/wealth-management/",
    kind: "Vendor product description · retrieved 18 Oct 2026",
  },
  fineract: {
    title: "Apache Fineract 1.15.0 documentation",
    url: "https://fineract.apache.org/docs/stable/",
    kind: "Upstream documentation · version 1.15.0 when retrieved",
  },
  history: {
    title: "Finacle 10 investment announcement",
    url: "https://www.finacle.com/news-room/press-release/finacle-infosys-unveils-finacle-10-next-generation-solution-banking-transformation/",
    kind: "Infosys · 20 February 2008 · historical",
  },
  photocraft: {
    title: "PhotoCraft project README",
    url: "https://github.com/storytold/photocraft",
    kind: "Project self-description · retrieved 18 Oct 2026",
  },
  release: {
    title: "Baseline release & acceptance record · PR 101",
    url: `${repository}/pull/101#issuecomment-6247475793`,
    kind: "Maintainer observation · private repository access required",
  },
  checks: {
    title: "Baseline CI · run 39109906999",
    url: `${repository}/actions/runs/39109906999`,
    kind: "Automated execution · baseline 1d0b8a8 · private",
  },
  implementation: {
    title: "Application source at assessment baseline",
    url: `${repository}/tree/${baseline}/app`,
    kind: "Implementation evidence · private",
  },
  recovery: {
    title: "Selected recovery and ownership tests",
    url: `${repository}/tree/${baseline}/tests`,
    kind: "Fixture-based behavioural evidence · private",
  },
  verification: {
    title: "Earlier live financial verification",
    url: `${repository}/blob/${baseline}/docs/verification.md`,
    kind: "Dated maintainer records · private · read checkpoint dates",
  },
  mcp: {
    title: "MCP security best practices",
    url: "https://modelcontextprotocol.io/docs/draft/tutorials/security/security_best_practices",
    kind: "Draft protocol guidance · roadmap reference",
  },
} as const;
export type SourceId = keyof typeof sources;
export const statuses = [
  {
    id: "core",
    label: "Core-connected",
    meaning:
      "Selected financial journey reaches Fineract; not a complete lifecycle.",
  },
  {
    id: "workflow",
    label: "Workflow / simulation",
    meaning:
      "Persistent app workflow; no corresponding financial or external settlement effect.",
  },
  {
    id: "partial",
    label: "Bounded pilot",
    meaning:
      "Selected real-core path exists; broader product lifecycle remains incomplete.",
  },
  {
    id: "gap",
    label: "Not established",
    meaning:
      "No sufficient implementation-level acceptance evidence for this boundary.",
  },
  {
    id: "roadmap",
    label: "Proposed",
    meaning: "Future scope, not an implemented customer capability.",
  },
] as const;
export type StatusId = (typeof statuses)[number]["id"];
type Capability = {
  name: string;
  area: "Retail journeys" | "Products" | "Bank controls" | "Future channels";
  status: StatusId;
  boundary: string;
  fineract: string;
  finacle: string;
  source: SourceId;
  proof: SourceId;
};
export const capabilities: Capability[] = [
  {
    name: "Savings account opening",
    area: "Retail journeys",
    status: "core",
    boundary:
      "Staged synthetic application, staff review and actual Core activation; KYC is simulated.",
    fineract: "Client & savings APIs",
    finacle: "Core product scope",
    source: "core",
    proof: "release",
  },
  {
    name: "Balances & statements",
    area: "Retail journeys",
    status: "core",
    boundary:
      "Scoped Core balances/history and CSV; stale observations are labelled.",
    fineract: "Savings APIs",
    finacle: "Core + digital scope",
    source: "digital",
    proof: "implementation",
  },
  {
    name: "Internal INR transfers",
    area: "Retail journeys",
    status: "core",
    boundary:
      "Reviewed same-branch synthetic transfer; debit and credit observed after reload.",
    fineract: "Account transfer APIs",
    finacle: "Core product scope",
    source: "core",
    proof: "release",
  },
  {
    name: "Teller cash & approvals",
    area: "Retail journeys",
    status: "core",
    boundary:
      "Selected deposits/withdrawals post after separate approval; demo personas are not IAM.",
    fineract: "Savings transactions",
    finacle: "Core product scope",
    source: "core",
    proof: "verification",
  },
  {
    name: "Customer-specific payees",
    area: "Retail journeys",
    status: "workflow",
    boundary:
      "Persistent owned lists and reviewed changes; payee registration itself posts no money.",
    fineract: "App orchestration",
    finacle: "Digital product scope",
    source: "digital",
    proof: "release",
  },
  {
    name: "Fixed & recurring deposits",
    area: "Products",
    status: "workflow",
    boundary:
      "Saved simulated holdings and approvals; no savings debit, investment or settlement.",
    fineract: "Deposit APIs upstream",
    finacle: "Deposit product scope",
    source: "core",
    proof: "implementation",
  },
  {
    name: "Cards, profile & service cases",
    area: "Products",
    status: "workflow",
    boundary: "Persistent app records; no card network or external fulfilment.",
    fineract: "Surround integration needed",
    finacle: "Digital product scope",
    source: "digital",
    proof: "implementation",
  },
  {
    name: "Household wealth planning",
    area: "Products",
    status: "workflow",
    boundary:
      "Live synthetic planning, budgets, saved scenarios and adviser consent; no investment execution.",
    fineract: "App-specific planning",
    finacle: "Separate wealth suite",
    source: "wealth",
    proof: "implementation",
  },
  {
    name: "Personal-loan lifecycle",
    area: "Products",
    status: "partial",
    boundary:
      "Origination and bounded Core repayment pilot; full servicing and collections unproven.",
    fineract: "Loan lifecycle APIs",
    finacle: "Lending product scope",
    source: "core",
    proof: "verification",
  },
  {
    name: "Interest, fees & reconciliation",
    area: "Bank controls",
    status: "gap",
    boundary:
      "Bank-specific rules, independent GL reconciliation and end-of-day acceptance outstanding.",
    fineract: "Accounting & jobs",
    finacle: "Core product scope",
    source: "core",
    proof: "verification",
  },
  {
    name: "Identity, KYC, AML & fraud",
    area: "Bank controls",
    status: "gap",
    boundary:
      "Production customer/staff identity, screening and operational response not established.",
    fineract: "Auth; bank integrations needed",
    finacle: "Configuration / integration",
    source: "core",
    proof: "implementation",
  },
  {
    name: "External payment rails",
    area: "Bank controls",
    status: "gap",
    boundary:
      "UPI, NEFT, RTGS, clearing and settlement are outside this implementation.",
    fineract: "Surround integration needed",
    finacle: "Separate payments suite",
    source: "core",
    proof: "implementation",
  },
  {
    name: "Resilience, migration & operations",
    area: "Bank controls",
    status: "gap",
    boundary:
      "Bank load/SLO, HA/DR, migration, cutover and independent acceptance outstanding.",
    fineract: "Deployment responsibility",
    finacle: "Deployment-specific assurance",
    source: "core",
    proof: "verification",
  },
  {
    name: "Production wealth management",
    area: "Products",
    status: "roadmap",
    boundary:
      "Execution, custody, suitability, market feeds and regulated advice require separate delivery.",
    fineract: "Not assessed",
    finacle: "Separate wealth suite",
    source: "wealth",
    proof: "implementation",
  },
  {
    name: "Customer AI chatbot",
    area: "Future channels",
    status: "roadmap",
    boundary:
      "Proposed support/interpretation interface; no customer banking assistant implemented.",
    fineract: "Not assessed",
    finacle: "Not assessed here",
    source: "digital",
    proof: "implementation",
  },
  {
    name: "Customer AI harness / MCP",
    area: "Future channels",
    status: "roadmap",
    boundary:
      "Proposed consented tool access; no customer-facing MCP server or delegation implemented.",
    fineract: "APIs are not MCP",
    finacle: "Not assessed here",
    source: "digital",
    proof: "implementation",
  },
];
export const gates = [
  [
    "Financial integrity",
    "Finance + core engineering",
    "Approve product/interest/fee rules; reconcile subledger to GL; prove end-of-day, reversals and exception recovery.",
  ],
  [
    "Identity & financial crime",
    "Security + compliance",
    "Real IAM/MFA, segregation of duties, KYC/AML/sanctions/fraud decisions and auditable response ownership.",
  ],
  [
    "Integration & settlement",
    "Payments + operations",
    "Certify rails and counterparties; reconcile clearing/settlement and handle rejected or delayed instructions.",
  ],
  [
    "Security & resilience",
    "Independent assessors + SRE",
    "Threat model and penetration testing; measured load/SLOs; HA, restore and disaster-recovery drills against agreed RTO/RPO.",
  ],
  [
    "Migration & operating model",
    "Data + bank operations",
    "Rehearse migration/cutover, reconcile opening balances, train support and demonstrate rollback and incident playbooks.",
  ],
  [
    "Independent acceptance",
    "Bank UAT + risk + accountable executives",
    "Accept the jurisdiction-specific control evidence, vendor assurance and pilot exit criteria before real customer funds.",
  ],
] as const;
export const allocations = [
  { name: "Financial rules & integrations", share: 30 },
  { name: "Verification & reconciliation", share: 25 },
  { name: "Identity, security & resilience", share: 20 },
  { name: "Customer & staff experience", share: 15 },
  { name: "Scope, research & operations", share: 10 },
] as const;
