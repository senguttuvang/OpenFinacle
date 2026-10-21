"use client";

import { FormSelect } from "../../../platform/form-controls/form-select";
import { allocations } from "../../product/product-evidence";
import "../assessment-report.css";
import { plans, Source, TableRegion } from "../evidence-presentation";
import type { AssessmentContext } from "../use-assessment";
export function BuildInvestment({ context }: { context: AssessmentContext }) {
  const {
    developers,
    setDevelopers,
    weeks,
    setWeeks,
    budget,
    setBudget,
    plan,
    setPlan,
    developerWeeks,
    days,
  } = context;
  return (
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
          does not measure causal productivity gains, a replacement cost, or an
          equivalent build of a commercial banking platform.
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
            historical figures; not lifetime cost or a current rebuild estimate.
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
            No cost estimate: provider/model, input/output/cache mix, rates and
            billing records are unspecified. INR and USD are not converted.
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
        960 times larger. The scopes and assurance obligations differ radically;
        this ratio is not an AI productivity multiplier. From-scratch parity has
        no credible estimate in this model.
      </p>
      <TableRegion label="Scrollable AI-assisted development assessment">
        <table>
          <caption>
            Judgment of AI-assisted development · qualitative assessment, not a
            controlled experiment
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
                Adversarial review, accounting expertise, integration ownership
                and incident accountability.
              </td>
            </tr>
            <tr>
              <th scope="row">Reuse of a mature open-source core</th>
              <td>
                Fineract supplies banking primitives; this is not a core
                authored in one week.
              </td>
              <td>
                Licensing/provenance review, product configuration, operational
                assurance and ongoing maintenance.
              </td>
            </tr>
          </tbody>
        </table>
      </TableRegion>
    </section>
  );
}
