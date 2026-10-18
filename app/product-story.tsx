"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { FormSelect } from "./form-select";
import {
  allocations,
  assessmentDate,
  capabilities,
  gates,
  type SourceId,
  type StatusId,
  sources,
  statuses,
} from "./product-evidence";
import "./product-story.css";

function Source({ id, children }: { id: SourceId; children?: ReactNode }) {
  return (
    <a href={sources[id].url} className="evidence-source">
      {children ?? sources[id].title}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}
function Status({ id }: { id: StatusId }) {
  return (
    <span className={`evidence-status ${id}`}>
      {statuses.find((s) => s.id === id)?.label}
    </span>
  );
}
function TableRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    // Keyboard focus lets readers scroll the wide data table without a pointer.
    // biome-ignore lint/a11y/noNoninteractiveTabindex: labelled scroll region needs keyboard access
    <section className="evidence-table-scroll" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
const screens = [
  [
    "accounts",
    "Savings & account facts",
    "Customer balances and account navigation.",
  ],
  [
    "statements",
    "Trace a transaction",
    "Transaction history, search and CSV export.",
  ],
  [
    "planning",
    "Synthetic household planning",
    "Budgets, goals and saved household scenarios.",
  ],
  [
    "onboarding",
    "Staged account opening",
    "Synthetic application and staff decisions.",
  ],
  [
    "branch",
    "The branch viewpoint",
    "Queues, officer review and separate approval.",
  ],
] as const;
const plans = {
  sandbox: {
    label: "Extend the synthetic sandbox",
    outcome: "A candidate for a bounded evaluation",
    condition:
      "Reuse Fineract and the current app. Freeze a small journey set; use synthetic data and existing infrastructure. Ten weeks is a planning envelope, not a delivery promise.",
  },
  pilot: {
    label: "Prepare a bank pilot",
    outcome: "Conditional on bank dependencies",
    condition:
      "Requires existing identity, rails, approved product rules and named bank reviewers. Discovery may consume the envelope. A real-money pilot starts only after every relevant gate is accepted.",
  },
  scratch: {
    label: "Build a broad core from scratch",
    outcome: "No credible ten-week commitment",
    condition:
      "A new ledger, product engine, integrations and operating assurance are a different programme. This resource model cannot establish Finacle parity or replace that discovery.",
  },
} as const;

export function ProductStory({ children }: { children?: ReactNode }) {
  const [area, setArea] = useState("All areas");
  const [status, setStatus] = useState("all");
  const [developers, setDevelopers] = useState("5");
  const [weeks, setWeeks] = useState("10");
  const [budget, setBudget] = useState(100);
  const [plan, setPlan] = useState<keyof typeof plans>("sandbox");
  const [agentMode, setAgentMode] = useState("read");
  const developerWeeks = Number(developers) * Number(weeks);
  const days = developerWeeks * 5;
  const visible = capabilities.filter(
    (row) =>
      (area === "All areas" || row.area === area) &&
      (status === "all" || row.status === status),
  );
  return (
    <div className="product-story">
      <a className="evidence-skip" href="#capabilities">
        Skip to capability comparison
      </a>
      <header className="evidence-header">
        <a className="evidence-brand" href="/assessment">
          <Landmark size={25} aria-hidden="true" />
          OpenFinacle<span>.</span>
        </a>
        <span>
          Banking capability assessment{" "}
          <span className="evidence-date">/ {assessmentDate}</span>
        </span>
      </header>
      <nav className="evidence-nav" aria-label="Assessment sections">
        <a href="#project">Assessment</a>
        <a href="#capabilities">Comparison</a>
        <a href="#proof">Evidence</a>
        <a href="#readiness">Production gates</a>
        <a href="#build">Effort & investment</a>
        <a href="#agents">Agent-connected banking</a>
      </nav>
      <section
        id="project"
        className="evidence-overview"
        aria-labelledby="assessment-title"
      >
        <div className="evidence-opening">
          <div>
            <h1 id="assessment-title">
              A working banking slice.
              <br />
              <em>An inspectable boundary.</em>
            </h1>
            <p>
              Can AI-assisted development turn a banking idea into a system a
              bank can evaluate? OpenFinacle connects customer and branch
              journeys to Apache Fineract, with real postings of synthetic
              money.
            </p>
            <a className="evidence-down" href="#proof">
              Inspect the proof <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
          <aside
            className="evidence-verdict"
            aria-label="Assessment conclusion"
          >
            <ShieldCheck size={28} aria-hidden="true" />
            <h2>
              Ready to inspect.
              <br />
              Bank acceptance outstanding.
            </h2>
            <dl>
              <div>
                <dt>Present</dt>
                <dd>
                  Connected savings journeys, persistent workflows, selected
                  recovery tests.
                </dd>
              </div>
              <div>
                <dt>Boundary</dt>
                <dd>
                  Synthetic identities and money. No independent production
                  acceptance.
                </dd>
              </div>
              <div>
                <dt>Decision</dt>
                <dd>
                  Evaluate a bounded sandbox; fund assurance before any
                  real-money use.
                </dd>
              </div>
            </dl>
          </aside>
        </div>
        <div className="evidence-summary">
          <figure className="evidence-distribution">
            <figcaption>
              <h2>What the selected scope contains</h2>
              <span>
                {capabilities.length} analyst-selected capability groups ·
                count, not parity
              </span>
            </figcaption>
            <div className="evidence-stacked" aria-hidden="true">
              {statuses.map((s) => (
                <span
                  key={s.id}
                  className={s.id}
                  style={{
                    flex: capabilities.filter((c) => c.status === s.id).length,
                  }}
                />
              ))}
            </div>
            <ul className="evidence-legend">
              {statuses.map((s) => (
                <li key={s.id}>
                  <span className={`evidence-dot ${s.id}`} />
                  <strong>
                    {capabilities.filter((c) => c.status === s.id).length}
                  </strong>{" "}
                  {s.label}
                </li>
              ))}
            </ul>
          </figure>
          <div className="evidence-baseline">
            <h2>Evidence checkpoint</h2>
            <p>
              <strong>1d0b8a8</strong> · baseline release
              <br />
              342 automated tests · 87 workspace checks
            </p>
            <Source id="checks">Inspect dated execution record</Source>
            <small>
              Test execution is not certification, coverage or defect absence.
            </small>
          </div>
        </div>
      </section>
      <section className="evidence-section" aria-labelledby="scope-title">
        <div className="evidence-section-heading">
          <h2 id="scope-title">Define the comparison before counting.</h2>
          <p>
            The unit is a capability group with an explicit boundary. A visible
            menu, an upstream API and an accepted bank control are different
            kinds of evidence.
          </p>
        </div>
        <div className="evidence-scope-grid">
          <div>
            <h3>Included</h3>
            <p>
              Individual INR savings, customer and branch journeys, selected
              product workflows and the controls needed to assess them.
            </p>
          </div>
          <div>
            <h3>Outside the denominator</h3>
            <p>
              Full corporate banking, trade finance, treasury, multi-country
              coverage and the complete Finacle product portfolio.
            </p>
          </div>
          <div>
            <h3>Method & limitations</h3>
            <p>
              16 unweighted, selected groups as of {assessmentDate}. No
              comprehensive vendor denominator, parity percentage or readiness
              score. Vendor descriptions are attributed claims, not independent
              tests.
            </p>
          </div>
        </div>
        <details className="evidence-method">
          <summary>
            <CircleHelp size={18} aria-hidden="true" /> How to read the evidence
          </summary>
          <dl>
            {statuses.map((s) => (
              <div key={s.id}>
                <dt>
                  <Status id={s.id} />
                </dt>
                <dd>{s.meaning}</dd>
              </div>
            ))}
          </dl>
          <p>
            <strong>Evidence ladder:</strong> visible UI → implemented workflow
            → actual Core effect → tested failure/recovery → independent bank
            acceptance. Higher assurance requires new evidence; it cannot be
            inferred from a screen or test count.
          </p>
        </details>
      </section>
      <section
        id="capabilities"
        className="evidence-section evidence-matrix-section"
        aria-labelledby="capability-title"
      >
        <div className="evidence-section-heading">
          <h2 id="capability-title">
            Capability, engine, product.
            <br />
            Keep the layers separate.
          </h2>
          <p>
            OpenFinacle is this implementation. Fineract 1.15.0 is its
            open-source core. Finacle is a broader commercial reference, not the
            engine or an equivalent deployment.
          </p>
        </div>
        <div className="evidence-filters">
          <div>
            <label htmlFor="evidence-area">Capability area</label>
            <FormSelect
              id="evidence-area"
              value={area}
              onValueChange={setArea}
              options={[
                "All areas",
                "Retail journeys",
                "Products",
                "Bank controls",
                "Future channels",
              ].map((value) => ({ value, label: value }))}
            />
          </div>
          <div>
            <label htmlFor="evidence-status">Implementation status</label>
            <FormSelect
              id="evidence-status"
              value={status}
              onValueChange={setStatus}
              options={[
                { value: "all", label: "All statuses" },
                ...statuses.map((s) => ({ value: s.id, label: s.label })),
              ]}
            />
          </div>
          <p role="status">
            Showing {visible.length} of {capabilities.length} selected groups
          </p>
        </div>
        <TableRegion label="Scrollable capability comparison">
          <table className="evidence-matrix">
            <caption>
              Selected capability comparison · {assessmentDate}. All rows still
              require bank-specific acceptance.
            </caption>
            <thead>
              <tr>
                <th scope="col">Capability / implementation boundary</th>
                <th scope="col">OpenFinacle</th>
                <th scope="col">Fineract upstream</th>
                <th scope="col">Finacle reference</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.name}>
                  <th scope="row">
                    {row.name}
                    <span className="evidence-boundary">{row.boundary}</span>
                  </th>
                  <td>
                    <Status id={row.status} />
                    <Source id={row.proof}>App evidence</Source>
                  </td>
                  <td>
                    {row.fineract}
                    <Source id="fineract">Documentation</Source>
                  </td>
                  <td>
                    {row.finacle}
                    <Source id={row.source}>Vendor source</Source>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
        {visible.length === 0 && (
          <p className="evidence-empty">
            No groups match these filters. Select “All areas” or “All statuses”
            to widen the view.
          </p>
        )}
        <p className="evidence-note">
          “Not assessed” means unknown in this review, not absent from a vendor
          product. Upstream features require configuration, integration and
          validation here. Bundled commercial modules and deployed scope vary by
          bank.
        </p>
      </section>
      <section
        id="proof"
        className="evidence-section"
        aria-labelledby="proof-title"
      >
        <div className="evidence-section-heading">
          <h2 id="proof-title">A claim should leave a trail.</h2>
          <p>
            These are dated maintainer observations and automated records.
            Source and CI links require access to the private repository. They
            are inspectable by authorised reviewers, not independent assurance.
          </p>
        </div>
        <div className="evidence-proof-grid">
          <figure className="evidence-transfer">
            <figcaption>
              <h3>One transfer. Two observed sides.</h3>
              <span>Recorded synthetic INR 1 transfer · 18 October 2026</span>
            </figcaption>
            <div className="evidence-transfer-pair">
              <div>
                <span>Sender statement</span>
                <strong>−₹1</strong>
                <small>Debit 231</small>
              </div>
              <ArrowRight aria-label="Same Core transfer" />
              <div>
                <span>Recipient statement</span>
                <strong>+₹1</strong>
                <small>Credit 232</small>
              </div>
            </div>
            <p className="evidence-net">
              Net movement across the pair <strong>₹0</strong>
            </p>
            <p>
              Core transfer 34; both statements persisted after reload and
              customer switching. This proves this selected transfer, not
              bank-wide reconciliation.
            </p>
            <Source id="release">Original observation record</Source>
          </figure>
          <div className="evidence-proof-ledger">
            <h3>Proof ledger</h3>
            <dl>
              <div>
                <dt>Release / execution</dt>
                <dd>
                  <strong>
                    1d0b8a8 · 342 tests / 3,846 assertions · 87 workspace checks
                  </strong>
                  <br />
                  Dated baseline counts, not this page’s changing live CI
                  status. <Source id="checks">CI record</Source>
                </dd>
              </div>
              <div>
                <dt>Persistence / scope</dt>
                <dd>
                  100 seeded relationships plus one staged onboarding observed
                  at the checkpoint; customer-specific payee lists retained.
                  Counts are a snapshot, not a live directory.{" "}
                  <Source id="release">Acceptance record</Source>
                </dd>
              </div>
              <div>
                <dt>Failure / recovery</dt>
                <dd>
                  Selected original-receipt, ownership, replay and uncertainty
                  behaviour tested with fixtures; earlier live reversal and
                  duplicate-prevention checks recorded.{" "}
                  <Source id="recovery">Tests</Source> ·{" "}
                  <Source id="verification">Live checkpoints</Source>
                </dd>
              </div>
              <div>
                <dt>Simulation boundary</dt>
                <dd>
                  FD/RD, cards, service cases and household planning persist as
                  app workflows; persistence does not establish investment,
                  network settlement or regulated advice.{" "}
                  <Source id="implementation">Source</Source>
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <section
          className="evidence-architecture"
          aria-label="Current architecture"
        >
          <div>
            <strong>Customer + branch</strong>
            <span>Application, review, enquiry</span>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <strong>Effect / TypeScript app</strong>
            <span>Commands, receipts, role/workspace scope</span>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <strong>Apache Fineract 1.15.0</strong>
            <span>Financial system of record</span>
          </div>
        </section>
        <p className="evidence-note">
          App workflows use D1; synthetic documents use R2. Core financial state
          uses PostgreSQL. A local frontend preview is not evidence of native
          financial functionality.
        </p>
      </section>
      <section
        id="readiness"
        className="evidence-section evidence-readiness"
        aria-labelledby="readiness-title"
      >
        <div className="evidence-section-heading">
          <h2 id="readiness-title">
            The production gap is an acceptance programme.
          </h2>
          <p>
            Selected controls exist. Independent end-to-end bank acceptance
            remains outstanding. Each gate needs a named owner, an agreed
            threshold and evidence that survives adverse conditions.
          </p>
        </div>
        <TableRegion label="Scrollable production acceptance gates">
          <table>
            <caption>
              Required acceptance gates · planning framework, not legal or
              regulatory certification
            </caption>
            <thead>
              <tr>
                <th scope="col">Gate</th>
                <th scope="col">Accountable participants</th>
                <th scope="col">Evidence required before release</th>
                <th scope="col">Current acceptance</th>
              </tr>
            </thead>
            <tbody>
              {gates.map(([name, owner, evidence]) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td>{owner}</td>
                  <td>{evidence}</td>
                  <td>
                    <span className="evidence-gate-state">Outstanding</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
        <p className="evidence-note">
          Core engine features do not automatically satisfy these
          implementation-level gates. Regulatory applicability and acceptance
          criteria must be established with the target institution and
          jurisdiction.
        </p>
      </section>
      <section
        id="build"
        className="evidence-section"
        aria-labelledby="build-title"
      >
        <div className="evidence-section-heading">
          <h2 id="build-title">
            Separate speed, effort
            <br />
            and accepted output.
          </h2>
          <p>
            AI can shorten exploration and implementation cycles. This project
            does not measure causal productivity gains, a replacement cost, or
            an equivalent build of a commercial banking platform.
          </p>
        </div>
        <div className="evidence-effort-context">
          <div>
            <h3>Founder-reported</h3>
            <strong>≈500M tokens / one week</strong>
            <p>
              Firsthand estimate for this demonstration. Focused human hours,
              token mix, billing and rework were not independently measured.
              Reuses an existing core and open-source foundations.
            </p>
          </div>
          <div>
            <h3>Historical vendor investment</h3>
            <strong>&gt;240,000 person-days / &gt;US$60M</strong>
            <p>
              Infosys’s February 2008 announcement: effort for Finacle 10 and
              investment during the preceding three years. Version-specific
              historical figures; not lifetime cost or a current rebuild
              estimate.
            </p>
            <Source id="history">Primary announcement</Source>
          </div>
        </div>
        <div className="evidence-model">
          <div className="evidence-model-inputs">
            <h3>Model a team’s resource envelope</h3>
            <p>
              Editable assumptions. Five working days and 40 hours per
              developer-week; no token-to-output conversion.
            </p>
            <label htmlFor="story-plan">Target scope</label>
            <FormSelect
              id="story-plan"
              value={plan}
              onValueChange={(value) => setPlan(value as keyof typeof plans)}
              options={Object.entries(plans).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
            />
            <div className="evidence-input-pair">
              <div>
                <label htmlFor="story-developers">Developers</label>
                <FormSelect
                  id="story-developers"
                  value={developers}
                  onValueChange={setDevelopers}
                  options={[1, 3, 5, 10].map((value) => ({
                    value: String(value),
                    label: `${value} developer${value === 1 ? "" : "s"}`,
                  }))}
                />
              </div>
              <div>
                <label htmlFor="story-weeks">Calendar weeks</label>
                <FormSelect
                  id="story-weeks"
                  value={weeks}
                  onValueChange={setWeeks}
                  options={[4, 10, 26, 52].map((value) => ({
                    value: String(value),
                    label: `${value} weeks`,
                  }))}
                />
              </div>
            </div>
            <label htmlFor="story-budget">
              AI token budget: {budget} billion
            </label>
            <input
              id="story-budget"
              type="range"
              min="1"
              max="100"
              value={budget}
              onChange={(event) => setBudget(Number(event.target.value))}
            />
          </div>
          <div
            className="story-calculation"
            aria-live="polite"
            aria-atomic="true"
          >
            <h3>{plans[plan].outcome}</h3>
            <dl>
              <div>
                <dt>Nominal team capacity</dt>
                <dd>{days.toLocaleString("en-US")} person-days</dd>
              </div>
              <div>
                <dt>At 40 hours / developer-week</dt>
                <dd>{(developerWeeks * 40).toLocaleString("en-US")} hours</dd>
              </div>
              <div>
                <dt>Total token budget</dt>
                <dd>{budget}B tokens</dd>
              </div>
              <div>
                <dt>Arithmetic token intensity</dt>
                <dd>{(budget / developerWeeks).toFixed(2)}B / dev-week</dd>
              </div>
            </dl>
            <p>{plans[plan].condition}</p>
            <small>
              No cost estimate: provider/model, input/output/cache mix, rates
              and billing records are unspecified. INR and USD are not
              converted.
            </small>
          </div>
        </div>
        <div className="evidence-planning-grid">
          <figure className="evidence-allocation">
            <figcaption>
              <h3>Illustrative effort composition</h3>
              <p>
                Modelled allocation of {days} person-days; fixed shares are a
                discussion assumption, not measured work or remaining-effort
                estimates.
              </p>
            </figcaption>
            <div className="evidence-axis" aria-hidden="true">
              <span>0</span>
              <span>50% of team capacity</span>
            </div>
            {allocations.map((item) => (
              <div className="evidence-bar-row" key={item.name}>
                <span>{item.name}</span>
                <div className="evidence-bar-track" aria-hidden="true">
                  <span style={{ width: `${item.share * 2}%` }} />
                </div>
                <strong>
                  {((days * item.share) / 100).toLocaleString("en-US")} days{" "}
                  <small>({item.share}%)</small>
                </strong>
              </div>
            ))}
          </figure>
          <div className="evidence-critical">
            <h3>A possible ten-week critical path</h3>
            <ol>
              <li>
                <strong>Weeks 1–2 · define</strong>
                <span>Research, scope and bank-owned acceptance criteria.</span>
              </li>
              <li>
                <strong>Weeks 3–6 · integrate & verify</strong>
                <span>
                  Financial failure paths, identity, reconciliation and
                  operational drills.
                </span>
              </li>
              <li>
                <strong>Weeks 7–10 · assess & remediate</strong>
                <span>
                  Bank UAT, independent security review and unresolved-gate
                  decisions.
                </span>
              </li>
            </ol>
            <p>
              Work can overlap. External access, bank decisions and independent
              review can extend elapsed time regardless of team size or token
              budget.
            </p>
          </div>
        </div>
        <p className="evidence-note">
          At the default 250 person-days, Finacle 10’s published effort is over
          960 times larger. The scopes and assurance obligations differ
          radically; this ratio is not an AI productivity multiplier.
          From-scratch parity has no credible estimate in this model.
        </p>
        <TableRegion label="Scrollable AI-assisted development assessment">
          <table>
            <caption>
              Judgment of AI-assisted development · qualitative assessment, not
              a controlled experiment
            </caption>
            <thead>
              <tr>
                <th scope="col">Observed contribution</th>
                <th scope="col">Evidence strength / limit</th>
                <th scope="col">What still needs people</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">
                  Connected UI, workflow code and test iterations
                </th>
                <td>
                  Working source and execution records. No comparable
                  conventional-team baseline or logged human hours.
                </td>
                <td>
                  Bank-domain interpretation, prioritisation and independent
                  acceptance.
                </td>
              </tr>
              <tr>
                <th scope="row">
                  Rapid exploration and failure-path remediation
                </th>
                <td>
                  Selected recovery tests and release fixes. Retries, rework and
                  coordination costs are not measured.
                </td>
                <td>
                  Adversarial review, accounting expertise, integration
                  ownership and incident accountability.
                </td>
              </tr>
              <tr>
                <th scope="row">Reuse of a mature open-source core</th>
                <td>
                  Fineract supplies banking primitives; this is not a core
                  authored in one week.
                </td>
                <td>
                  Licensing/provenance review, product configuration,
                  operational assurance and ongoing maintenance.
                </td>
              </tr>
            </tbody>
          </table>
        </TableRegion>
      </section>
      <section
        id="agents"
        className="evidence-section evidence-future"
        aria-labelledby="agents-title"
      >
        <div className="evidence-section-heading">
          <h2 id="agents-title">
            A bank your AI can work with.
            <br />
            Under your authority.
          </h2>
          <p>
            Proposed architecture. A customer’s chosen AI harness could use
            scoped banking tools. Language interpretation would remain separate
            from authorisation, posting and financial truth.
          </p>
        </div>
        <fieldset
          className="evidence-mode"
          aria-label="Proposed agent scenario"
        >
          <button
            type="button"
            aria-pressed={agentMode === "read"}
            onClick={() => setAgentMode("read")}
          >
            Read an account
          </button>
          <button
            type="button"
            aria-pressed={agentMode === "write"}
            onClick={() => setAgentMode("write")}
          >
            Prepare a payment
          </button>
        </fieldset>
        <ol className="evidence-agent-flow">
          <li>
            <strong>Customer AI harness</strong>
            <span>Interprets the customer’s request.</span>
          </li>
          <li>
            <strong>Consent & delegation</strong>
            <span>
              Short-lived, revocable grant; least privilege and explicit account
              scope.
            </span>
          </li>
          <li>
            <strong>Authorised tools / MCP</strong>
            <span>
              Enforce tool, identity, audience and read/write scopes at the bank
              boundary.
            </span>
          </li>
          <li>
            <strong>Bank command & Core</strong>
            <span>
              Validate policy, persist intent and reconcile the authoritative
              outcome.
            </span>
          </li>
        </ol>
        <div className="evidence-agent-result" aria-live="polite">
          <h3>
            {agentMode === "read"
              ? "Read scope: accounts.read + statements.read"
              : "Write scope: payments.prepare → customer confirmation"}
          </h3>
          <p>
            {agentMode === "read"
              ? "Return only permitted accounts and a timestamped observation. A read grant cannot submit a payment. Revoke access without exposing credentials to the model."
              : "Prepare payee, amount, limits and fees for explicit human review. Bind confirmation to that exact intent; use an idempotent command and a durable receipt. An uncertain outcome blocks further writes until reconciled."}
          </p>
          <p>
            <strong>Always:</strong> defend against prompt injection, minimise
            disclosed data, log access and decisions, enforce revocation at each
            tool call, and keep a recoverable audit trail.{" "}
            <Source id="mcp">Protocol security reference</Source>
          </p>
        </div>
        <TableRegion label="Scrollable roadmap boundaries">
          <table>
            <caption>
              Current foundation versus proposed scope · no delivery dates
              committed
            </caption>
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col">State</th>
                <th scope="col">Next evidence required</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Synthetic household planning</th>
                <td>
                  <Status id="workflow" /> Already live
                </td>
                <td>
                  Retain saved scenarios and consent boundary; do not equate
                  planning with regulated wealth services.
                </td>
              </tr>
              <tr>
                <th scope="row">Production wealth management</th>
                <td>
                  <Status id="roadmap" />
                </td>
                <td>
                  Suitability/advice controls, real market data, order
                  execution, custody and settlement acceptance.
                </td>
              </tr>
              <tr>
                <th scope="row">AI chatbot</th>
                <td>
                  <Status id="roadmap" />
                </td>
                <td>
                  Grounded answers, privacy, escalation, evaluation and clear
                  separation from authority to transact.
                </td>
              </tr>
              <tr>
                <th scope="row">Customer-facing MCP / AI harness</th>
                <td>
                  <Status id="roadmap" />
                </td>
                <td>
                  Consent, scoped authorisation, revocation, threat model and
                  tool-level recovery proof.
                </td>
              </tr>
            </tbody>
          </table>
        </TableRegion>
      </section>
      <section
        id="experience"
        className="evidence-section"
        aria-labelledby="experience-title"
      >
        <div className="evidence-section-heading">
          <h2 id="experience-title">Now inspect the experience.</h2>
          <p>
            Actual application screenshots from synthetic local acceptance
            fixtures. These are screen previews, not live balances or new
            evidence of production readiness. Open any image at full size.
          </p>
        </div>
        <div className="story-gallery">
          {screens.map(([id, title, description]) => (
            <figure key={id}>
              <a
                href={`/product/${id}.webp`}
                target="_blank"
                rel="noreferrer"
                aria-label={`View full screenshot: ${title} (opens in a new tab)`}
              >
                <Image
                  src={`/product/${id}.webp`}
                  alt={`${title} — synthetic OpenFinacle application fixture`}
                  width={1440}
                  height={1000}
                  unoptimized
                  loading="lazy"
                />
                <span>
                  <ArrowUpRight size={16} aria-hidden="true" /> Full screenshot
                </span>
              </a>
              <figcaption>
                <h3>{title}</h3>
                <p>{description}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section
        id="demo-entry"
        className="evidence-section evidence-demo"
        aria-labelledby="demo-title"
      >
        <div className="evidence-section-heading">
          <h2 id="demo-title">Try a bounded banking journey.</h2>
          <p>
            Use sample details and synthetic money only. Inspect a statement,
            follow customer and staff views, or explore saved household
            scenarios in Wealth & Planning.
          </p>
        </div>
        {children ?? (
          <a className="evidence-demo-link" href="/#demo-entry">
            Open the banking workspace{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        )}
      </section>
      <footer className="evidence-section evidence-footer">
        <h2>Attribution, sources and the limits of this assessment.</h2>
        <div className="evidence-scope-grid">
          <div>
            <h3>Actual foundations</h3>
            <p>
              Created by SenG with AI coding assistance. Apache Fineract, an
              Apache Software Foundation project, is the actual banking core.
              Other foundations include Next.js, React, Effect, Radix UI, Bun,
              PostgreSQL and Cloudflare.
            </p>
          </div>
          <div>
            <h3>Product reference</h3>
            <p>
              Finacle (Infosys / EdgeVerve) is inspiration and a public
              comparison reference. OpenFinacle is an independent demonstration,
              with no affiliation, endorsement or certification implied. The
              working name carries no legal or trademark-clearance claim.
            </p>
          </div>
          <div>
            <h3>The PhotoCraft analogy</h3>
            <p>
              PhotoCraft describes an independent Photoshop reimplementation.
              The useful idea is inspectable behaviour and explicit limits, not
              a claim that Adobe is open source. Banking adds accounting,
              control and institutional acceptance obligations.{" "}
              <Source id="photocraft">Project self-description</Source>
            </p>
          </div>
        </div>
        <details className="evidence-method">
          <summary>
            <Check size={18} aria-hidden="true" /> Source register · provenance
            & dates
          </summary>
          <ul className="evidence-source-register">
            {Object.entries(sources).map(([id, source]) => (
              <li key={id}>
                <Source id={id as SourceId} />
                <span>{source.kind}</span>
              </li>
            ))}
          </ul>
        </details>
        <p className="evidence-note">
          Assessment date: {assessmentDate}. Reported = firsthand estimate;
          observed = dated maintainer record; tested = selected automated
          execution; modelled = explicit planning assumption; proposed = future
          scope. None means independently accepted production capability.{" "}
          <a href="/assessment">Permanent public assessment URL</a>.
        </p>
      </footer>
    </div>
  );
}
