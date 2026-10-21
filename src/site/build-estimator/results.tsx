import {
  type calculateTeam,
  historicalSources,
} from "../build-story/build-recipe-model";
import type { EstimatorScenario } from "./scenarios";

type Result = ReturnType<typeof calculateTeam>;
const number = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value);
const inr = (value: number) =>
  `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
const usd = (value: number) =>
  `US$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
const range = (low: number | null, high: number | null, format = number) =>
  low === null || high === null
    ? "Not estimable"
    : `${format(low)}–${format(high)}`;

export function EstimatorResults({
  a,
  b,
  weeks,
  scenario,
}: {
  a: Result;
  b: Result;
  weeks: number;
  scenario: EstimatorScenario;
}) {
  const teams = [
    { name: "A", result: a },
    { name: "B", result: b },
  ];
  const reduction =
    a.valid && b.valid && a.high > 0 ? (1 - b.high / a.high) * 100 : null;
  return (
    <section className="est-results" aria-label="Comparison results">
      <div className="est-result-heading">
        <h2>One brief. Two delivery approaches.</h2>
        <span>Planned · {weeks} weeks</span>
      </div>
      <div className="est-columns">
        <article className="est-reference">
          <span className="est-kicker">Commercial reference</span>
          <h3>Finacle</h3>
          <p className="est-total">Unknown</p>
          <p>Acquisition & run cost</p>
          <hr />
          <p>
            A broad commercial banking suite. Vendor proposal and bank
            implementation scope required.
          </p>
          <p>
            <strong>Historical anchor</strong>
            <br />
            Over 240,000 person-days reported for Finacle 10 in 2008.
          </p>
          <a href={historicalSources.version10}>
            Read the vendor announcement ↗
          </a>
          <p className="est-footnote">
            Version-specific effort, not a current price, lifetime total or
            equivalent to this slice.
          </p>
        </article>
        {teams.map(({ name, result }) => (
          <article
            className="est-team-result"
            key={name}
            aria-label={`Team ${name} results`}
          >
            <span className="est-kicker">
              {name === "A"
                ? "Human-led · light AI"
                : "AI-first · human review"}
            </span>
            <h3>Team {name}</h3>
            <p className="est-total">
              {scenario.estimable ? inr(result.peopleInr) : "Scope first"}
            </p>
            <p>People budget · {weeks} weeks</p>
            <p className="est-api">
              {scenario.estimable ? usd(result.aiUsd) : "Not priced"}
              <span> API allowance · separate USD</span>
            </p>
            <dl>
              <div>
                <dt>Human allocation</dt>
                <dd>
                  {scenario.estimable
                    ? `${number(result.rawDays)} person-days`
                    : "Bank-defined"}
                </dd>
              </div>
              <div>
                <dt>Modelled work</dt>
                <dd>
                  {scenario.estimable
                    ? `${range(result.low, result.high)} ref. days`
                    : "Discovery required"}
                </dd>
              </div>
              <div>
                <dt>Delivery range</dt>
                <dd>
                  {scenario.estimable
                    ? `${range(result.lowWeeks, result.highWeeks)}${result.lowWeeks === null ? "" : " weeks"}`
                    : "Not estimable"}
                </dd>
              </div>
            </dl>
            <p className="est-fit">
              {scenario.estimable
                ? result.fit
                : "Requirements & acceptance gates needed"}
            </p>
          </article>
        ))}
      </div>
      <div className="est-insight" aria-live="polite">
        <strong>
          {scenario.estimable && reduction !== null
            ? `${number(Math.abs(reduction))}% ${reduction >= 0 ? "less" : "more"} modelled work for B vs A`
            : "No comparable delivery estimate"}
        </strong>
        <p>
          {scenario.estimable
            ? "Driven by entered drafting and review assumptions. Tokens change API spend, not productivity. Expert controls remain human work."
            : scenario.basis}
        </p>
      </div>
      <details className="est-completion">
        <summary>
          Cost through modelled delivery, beyond the selected window
        </summary>
        {teams.map(({ name, result }) => (
          <p key={name}>
            Team {name}:{" "}
            {scenario.estimable && result.completionBudget
              ? `${range(result.completionBudget.peopleLow, result.completionBudget.peopleHigh, inr)} people; ${range(result.completionBudget.aiLow, result.completionBudget.aiHigh, usd)} API.`
              : "Not estimable."}
          </p>
        ))}
        <p>
          Same crew and weekly spending throughout. External dependencies can
          extend the calendar. Excludes hosting, tools, taxes and bank-specific
          work.
        </p>
      </details>
    </section>
  );
}
