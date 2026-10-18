"use client";

import { ArrowRight, ChevronDown, Users } from "lucide-react";
import { useState } from "react";
import {
  type ComparisonInput,
  calculateHistory,
  calculateTeam,
  compositions,
  crewFor,
  defaultComparison,
  defaultHistory,
  defaultTeam,
  historicalSources,
  impactScenario,
  recipeModels,
  recipeModules,
  scopeOptions,
  type TeamInput,
} from "./build-recipe-model";
import { FormSelect } from "./form-select";
import "./build-comparison.css";

const number = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Math.abs(n) > 0 && Math.abs(n) < 1 ? 3 : 1,
  }).format(n);
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
const usd = (n: number) =>
  `US$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}`;
const compactInr = (n: number) =>
  n >= 10000000 ? `₹${number(n / 10000000)} crore` : inr(n);
const weeks = (low: number | null, high: number | null) =>
  low === null || high === null
    ? "No delivery range"
    : `${number(low)}–${number(high)} weeks`;
function Slider({
  id,
  label,
  value,
  min = 0,
  max,
  step = 1,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="comparison-slider">
      <label htmlFor={id}>
        <span>{label}</span>
        <strong>{display ?? number(value)}</strong>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
function Numeric({
  id,
  label,
  value,
  onChange,
  max = 100000000,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const invalid =
    raw !== null &&
    raw !== "" &&
    (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > max);
  return (
    <div className="comparison-number">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min="0"
        max={max}
        value={raw ?? (value || "")}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => {
          const text = e.target.value;
          setRaw(text);
          const n = Number(text);
          if (Number.isFinite(n) && n >= 0 && n <= max) onChange(n);
        }}
      />
      {invalid && (
        <small id={`${id}-error`}>
          Enter 0–{number(max)}. The last valid value stays in the chart.
        </small>
      )}
    </div>
  );
}
function Bars({
  title,
  unit,
  rows,
  log = false,
  money = false,
}: {
  title: string;
  unit: string;
  rows: { label: string; value: number; detail?: string; tone?: string }[];
  log?: boolean;
  money?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const scale = (n: number) =>
    log ? (Math.log10(n + 1) / Math.log10(max + 1)) * 100 : (n / max) * 100;
  return (
    <figure className="comparison-chart">
      <figcaption>
        <strong>{title}</strong>
        <span>
          {unit}
          {log ? " · logarithmic scale" : " · shared linear scale"}
        </span>
      </figcaption>
      <div className="comparison-bars">
        {rows.map((row) => (
          <div className="comparison-bar-row" key={row.label}>
            <div>
              <span>{row.label}</span>
              <strong>
                {money ? compactInr(row.value) : number(row.value)}
              </strong>
            </div>
            <div className="comparison-bar-track" aria-hidden="true">
              <span
                className={row.tone ?? "history"}
                style={{ width: `${scale(row.value)}%` }}
              />
            </div>
            {row.detail && <small>{row.detail}</small>}
          </div>
        ))}
      </div>
      <div className="comparison-axis" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = log ? Math.pow(max + 1, fraction) - 1 : max * fraction;
          return (
            <span key={fraction}>
              {value >= 1e9
                ? `${number(value / 1e9)}B`
                : value >= 1e6
                  ? `${number(value / 1e6)}M`
                  : value >= 1000
                    ? `${number(value / 1000)}k`
                    : number(value)}
            </span>
          );
        })}
      </div>
    </figure>
  );
}
function TeamEditor({
  id,
  team,
  setTeam,
  input,
}: {
  id: "A" | "B";
  team: TeamInput;
  setTeam: (t: TeamInput) => void;
  input: ComparisonInput;
}) {
  const update = <K extends keyof TeamInput>(key: K, value: TeamInput[K]) =>
    setTeam({ ...team, [key]: value });
  const result = calculateTeam(team, input);
  const presetCrew = crewFor(result.people, team.composition);
  const customMix =
    team.interns !== presetCrew.interns ||
    team.developers !== presetCrew.developers ||
    team.experts !== presetCrew.experts;
  return (
    <section
      className={`comparison-team team-${id.toLowerCase()}`}
      aria-labelledby={`team-${id}-title`}
    >
      <header>
        <span className="comparison-team-letter" aria-hidden="true">
          {id}
        </span>
        <div>
          <h3 id={`team-${id}-title`}>
            Team {id} · {id === "A" ? "Human-led" : "AI-first"}
          </h3>
          <p>
            {id === "A"
              ? "People write the implementation. AI helps with autocomplete and occasional drafts."
              : "AI drafts across the workflow. People direct, review and own the result."}
          </p>
        </div>
      </header>
      <fieldset className="comparison-compositions">
        <legend>Talent mix</legend>
        {compositions.map((composition) => (
          <button
            type="button"
            key={composition}
            aria-pressed={!customMix && team.composition === composition}
            onClick={() =>
              setTeam({
                ...team,
                composition,
                ...crewFor(result.people || 5, composition),
              })
            }
          >
            {composition}
          </button>
        ))}
      </fieldset>
      <Slider
        id={`${id}-size`}
        label="Team size"
        value={result.people}
        min={0}
        max={30}
        display={`${result.people} people`}
        onChange={(n) => setTeam({ ...team, ...crewFor(n, team.composition) })}
      />
      {customMix && <p className="comparison-crew">Your custom talent mix</p>}
      <p className="comparison-crew">
        <Users size={17} aria-hidden="true" /> {team.interns}{" "}
        {team.interns === 1 ? "intern" : "interns"} · {team.developers}{" "}
        experienced · {team.experts} {team.experts === 1 ? "expert" : "experts"}
      </p>
      <p className="comparison-crew">
        Monthly salaries: {inr(result.monthlyPay)}
      </p>
      <p className="comparison-visible-assumptions">
        AI helps with {number(team.aiShare * 100)}% of drafting tasks. Assumed
        drafting saving: {number(team.draftSaving * 100)}%; added review:{" "}
        {number(team.review * 100)}% on that share. Adjust these hypotheses
        below.
      </p>
      <div className="comparison-model">
        <label htmlFor={`${id}-model`}>AI companion</label>
        <FormSelect
          id={`${id}-model`}
          value={team.model}
          onValueChange={(model) =>
            update("model", model as TeamInput["model"])
          }
          options={recipeModels.map((m) => ({ value: m.id, label: m.name }))}
        />
      </div>
      <fieldset className="comparison-reasoning">
        <legend>Reasoning scenario</legend>
        {(["low", "medium"] as const).map((reasoning) => (
          <button
            type="button"
            aria-pressed={team.reasoning === reasoning}
            key={reasoning}
            onClick={() =>
              setTeam({
                ...team,
                reasoning,
                outputShare: reasoning === "low" ? 0.1 : 0.2,
              })
            }
          >
            {reasoning === "low" ? "Low" : "Medium"}
          </button>
        ))}
      </fieldset>
      <fieldset className="comparison-reasoning">
        <legend>AI allowance</legend>
        <button
          type="button"
          aria-pressed={team.funding === "tokens"}
          onClick={() => update("funding", "tokens")}
        >
          Token usage
        </button>
        <button
          type="button"
          aria-pressed={team.funding === "budget"}
          onClick={() => update("funding", "budget")}
        >
          USD budget
        </button>
      </fieldset>
      {team.funding === "tokens" ? (
        <Slider
          id={`${id}-tokens`}
          label="Tokens / person / working day"
          min={0}
          max={6}
          step={0.02}
          value={Math.log10(team.dailyTokensM * 1000 + 1)}
          display={
            team.dailyTokensM < 1
              ? `${number(team.dailyTokensM * 1000)}k`
              : `${number(team.dailyTokensM)}M`
          }
          onChange={(n) => update("dailyTokensM", (Math.pow(10, n) - 1) / 1000)}
        />
      ) : (
        <Numeric
          id={`${id}-budget`}
          label="Whole-window AI budget · USD"
          max={1000000}
          value={team.budgetUsd}
          onChange={(n) => update("budgetUsd", n)}
        />
      )}
      <div className="comparison-team-total">
        <div>
          <span>{input.weeks}-week people cost</span>
          <strong>{inr(result.peopleInr)}</strong>
        </div>
        <div>
          <span>API usage · {number(result.tokensM)}M tokens</span>
          <strong>{usd(result.aiUsd)}</strong>
        </div>
      </div>
      <details className="comparison-details">
        <summary>
          Shape this team’s assumptions{" "}
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div>
          {(
            [
              ["interns", "Interns"],
              ["developers", "Experienced developers"],
              ["experts", "Experts"],
            ] as const
          ).map(([key, label]) => (
            <Slider
              key={key}
              id={`${id}-${key}`}
              label={label}
              value={team[key]}
              max={30 - result.people + team[key]}
              onChange={(n) => update(key, n)}
            />
          ))}
          <Slider
            id={`${id}-ai-share`}
            label="Drafting tasks using AI"
            value={team.aiShare * 100}
            max={100}
            display={`${number(team.aiShare * 100)}%`}
            onChange={(n) => update("aiShare", n / 100)}
          />
          <Slider
            id={`${id}-saving`}
            label="Assumed time saved on assisted drafting"
            value={team.draftSaving * 100}
            max={80}
            display={`${number(team.draftSaving * 100)}%`}
            onChange={(n) => update("draftSaving", n / 100)}
          />
          <Slider
            id={`${id}-review`}
            label="Added human review on assisted drafting"
            value={team.review * 100}
            max={80}
            display={`${number(team.review * 100)}%`}
            onChange={(n) => update("review", n / 100)}
          />
          <Slider
            id={`${id}-coordination`}
            label="Learning & coordination allowance"
            value={team.coordination * 100}
            max={60}
            display={`${number(team.coordination * 100)}%`}
            onChange={(n) => update("coordination", n / 100)}
          />
          <Slider
            id={`${id}-overhead`}
            label="Payroll overhead"
            value={team.overhead * 100}
            max={150}
            display={`${number(team.overhead * 100)}%`}
            onChange={(n) => update("overhead", n / 100)}
          />
          <Slider
            id={`${id}-output`}
            label="Generated / reasoning share of tokens"
            value={team.outputShare * 100}
            min={1}
            max={80}
            display={`${number(team.outputShare * 100)}%`}
            onChange={(n) => update("outputShare", n / 100)}
          />
          <Slider
            id={`${id}-cache`}
            label="Cache hits · share of input"
            value={team.cachedShare * 100}
            max={90}
            display={`${number(team.cachedShare * 100)}%`}
            onChange={(n) =>
              setTeam({
                ...team,
                cachedShare: n / 100,
                cacheWriteShare: Math.min(team.cacheWriteShare, 1 - n / 100),
              })
            }
          />
          <Slider
            id={`${id}-cache-write`}
            label="Cache writes · share of input"
            value={team.cacheWriteShare * 100}
            max={100 - team.cachedShare * 100}
            display={`${number(team.cacheWriteShare * 100)}%`}
            onChange={(n) => update("cacheWriteShare", n / 100)}
          />
          <p>
            Task allocation and time savings are hypotheses. Reasoning presets
            assume 10% / 20% generated tokens; change the mix above. Tokens and
            model price never add delivery capacity.
          </p>
        </div>
      </details>
    </section>
  );
}
export function BuildRecipe() {
  const [input, setInput] = useState(defaultComparison);
  const [a, setA] = useState(() => defaultTeam("A")),
    [b, setB] = useState(() => defaultTeam("B"));
  const [history, setHistory] = useState(defaultHistory);
  const [metric, setMetric] = useState<"people" | "effort" | "team">("people");
  const [log, setLog] = useState(false);
  const [benefit, setBenefit] = useState(0),
    [running, setRunning] = useState(0),
    [fx, setFx] = useState(0);
  const resultA = calculateTeam(a, input),
    resultB = calculateTeam(b, input),
    past = calculateHistory(history);
  const update = <K extends keyof ComparisonInput>(
    key: K,
    value: ComparisonInput[K],
  ) => setInput({ ...input, [key]: value });
  const six = compositions.flatMap((composition) => [
    {
      label: `A · ${composition}`,
      tone: "team-a",
      result: calculateTeam(
        { ...a, composition, ...crewFor(resultA.people, composition) },
        input,
      ),
    },
    {
      label: `B · ${composition}`,
      tone: "team-b",
      result: calculateTeam(
        { ...b, composition, ...crewFor(resultB.people, composition) },
        input,
      ),
    },
  ]);
  const current = [
    {
      label: "Finacle · lifetime scenario",
      value:
        metric === "people"
          ? past.total
          : metric === "effort"
            ? past.personDays
            : history.engineers,
      detail: `${history.years} years · ${history.engineers} assumed average engineers${metric === "people" ? ` · ${compactInr(past.low)}–${compactInr(past.high)} sensitivity envelope` : ""}`,
      tone: "history",
    },
    ...[
      { label: "Team A · human-led", r: resultA, tone: "team-a" },
      { label: "Team B · AI-first", r: resultB, tone: "team-b" },
    ].map(({ label, r, tone }) => ({
      label,
      value:
        metric === "people"
          ? r.peopleInr
          : metric === "effort"
            ? r.rawDays
            : r.people,
      detail: `${input.weeks} weeks · ${r.people} people`,
      tone,
    })),
  ];
  return (
    <div className="team-comparison">
      <section className="comparison-history" aria-labelledby="history-title">
        <div>
          <h3 id="history-title">A product built across decades.</h3>
          <p>
            Finacle launched in 2000. Its predecessor dates to 1993. A long
            product history includes evolving markets, integrations, delivery
            and ongoing care.
          </p>
          <a href="/build-story#history">
            Read the historical sources{" "}
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
        <dl>
          <div>
            <dt>Finacle 10 effort · reported 2008</dt>
            <dd>240,000+ person-days</dd>
          </div>
          <div>
            <dt>Investment · preceding 3 years</dt>
            <dd>US$60M+</dd>
          </div>
          <div>
            <dt>Finacle business unit · around 2006</dt>
            <dd>Nearly 2,500 people</dd>
          </div>
        </dl>
        <p className="comparison-history-note">
          Sources: <a href={historicalSources.launch}>Infosys launch</a>,{" "}
          <a href={historicalSources.version10}>Finacle 10 release</a>,{" "}
          <a href={historicalSources.case}>Dartmouth case study</a>.
          Business-unit headcount includes delivery and commercial roles. These
          snapshots do not establish lifetime engineering payroll or today’s
          team size.
        </p>
      </section>
      <div className="comparison-brief">
        <div>
          <h3>One brief. Two approaches.</h3>
          <p>
            Choose what both new teams are trying to build. Compare all six
            talent combinations below, then decide what you find credible.
          </p>
        </div>
        <a className="comparison-jump" href="#comparison-results">
          Jump to the charts ↓
        </a>
      </div>
      <div className="comparison-shared">
        <Slider
          id="comparison-weeks"
          label="Time available"
          value={input.weeks}
          min={2}
          max={52}
          display={`${input.weeks} weeks`}
          onChange={(n) => update("weeks", n)}
        />
        <div className="comparison-model">
          <label htmlFor="comparison-scope">The starting line</label>
          <FormSelect
            id="comparison-scope"
            value={input.scope}
            onValueChange={(scope) =>
              update("scope", scope as ComparisonInput["scope"])
            }
            options={scopeOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <Slider
          id="comparison-complexity"
          label="Workload complexity assumption · applies to both teams"
          value={input.complexity}
          min={0.25}
          max={4}
          step={0.25}
          display={`${number(input.complexity)}× baseline module work`}
          onChange={(n) => update("complexity", n)}
        />
        <fieldset className="comparison-capabilities">
          <legend>Capabilities in the brief</legend>
          {recipeModules.map((m) => (
            <label key={m.id}>
              <input
                type="checkbox"
                checked={input.modules.includes(m.id)}
                onChange={(e) =>
                  update(
                    "modules",
                    e.target.checked
                      ? [...input.modules, m.id]
                      : input.modules.filter((id) => id !== m.id),
                  )
                }
              />
              {m.name}
            </label>
          ))}
        </fieldset>
        <p>
          Existing-core scenarios reuse Apache Fineract or a comparable engine.
          “Written anew” means a bounded core starter. None of these scopes
          represents the whole current Finacle suite.
        </p>
      </div>
      <div className="comparison-teams">
        <TeamEditor id="A" team={a} setTeam={setA} input={input} />
        <TeamEditor id="B" team={b} setTeam={setB} input={input} />
      </div>
      <section
        className="comparison-results"
        id="comparison-results"
        aria-labelledby="comparison-results-title"
      >
        <div className="comparison-results-heading">
          <h3 id="comparison-results-title">
            What could fit in {input.weeks} weeks?
          </h3>
          <p>
            These ranges follow your assumptions. Real bank access, integration
            lead times and acceptance can extend the calendar.
          </p>
        </div>
        <div className="comparison-delivery">
          {[
            { id: "A", r: resultA },
            { id: "B", r: resultB },
          ].map(({ id, r }) => (
            <div key={id} className={`delivery-${id.toLowerCase()}`}>
              <h4>Team {id}</h4>
              <strong className="comparison-duration">
                {weeks(r.lowWeeks, r.highWeeks)}
              </strong>
              <p>{r.fit}</p>
              <div className="comparison-demand" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.min(100, (r.capacity / Math.max(1, r.high)) * 100)}%`,
                  }}
                />
              </div>
              <small>
                {number(r.capacity)} reference developer-days available /{" "}
                {number(r.low)}–{number(r.high)} needed
              </small>
              {r.completionBudget && (
                <div className="comparison-completion-cost">
                  <strong>Budget through the modelled delivery range</strong>
                  <span>
                    People: {inr(r.completionBudget.peopleLow)}–
                    {inr(r.completionBudget.peopleHigh)}
                  </span>
                  <span>
                    API: {usd(r.completionBudget.aiLow)}–
                    {usd(r.completionBudget.aiHigh)}
                  </span>
                  <small>
                    At the same weekly crew and AI spending rate, including
                    entered overhead. This can exceed the selected-window
                    allowance.
                  </small>
                </div>
              )}
              <p className="comparison-human-controls">
                {r.controlsHigh > 0
                  ? `${number(r.controlsLow)}–${number(r.controlsHigh)} expert control-days included; ${number(r.expertCapacity)} expert-days available.`
                  : "A working feature prototype still needs independent financial, security and bank acceptance work."}
              </p>
            </div>
          ))}
        </div>
        <section
          className="comparison-milestones"
          aria-label="Capability sequence within the window"
        >
          <h4>A meaningful slice, capability by capability.</h4>
          <p>
            If work follows this sequence, how much could each team cover? Human
            controls are reserved first. A modelled fit still needs financial
            and bank acceptance.
          </p>
          <div className="comparison-milestone-head">
            <span>Selected capability</span>
            <strong>Team A</strong>
            <strong>Team B</strong>
          </div>
          <ul>
            {resultA.milestones.map((module, index) => (
              <li key={module.id}>
                <strong>{module.name}</strong>
                <span>
                  {module.status}
                  <small>
                    {number(module.cumulativeLow)}–
                    {number(module.cumulativeHigh)} cumulative days
                  </small>
                </span>
                <span>
                  {resultB.milestones[index]?.status}
                  <small>
                    {number(resultB.milestones[index]?.cumulativeLow ?? 0)}–
                    {number(resultB.milestones[index]?.cumulativeHigh ?? 0)}{" "}
                    cumulative days
                  </small>
                </span>
              </li>
            ))}
          </ul>
          {!resultA.milestones.length && (
            <p>Choose capabilities to explore the sequence.</p>
          )}
        </section>
        <p className="comparison-outcome-note">
          A fitting range describes capacity for the selected brief. It does not
          establish production readiness or accepted Finacle parity. A team can
          deliver a meaningful slice while the broader product continues to
          grow.
        </p>
        <fieldset className="comparison-metric">
          <legend>Compare the investment</legend>
          {(
            [
              { id: "people", label: "People cost · INR" },
              { id: "effort", label: "Human effort · days" },
              { id: "team", label: "Team size" },
            ] as const
          ).map((m) => (
            <button
              type="button"
              key={m.id}
              aria-pressed={metric === m.id}
              onClick={() => setMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
          <label>
            <input
              type="checkbox"
              checked={log}
              onChange={(e) => setLog(e.target.checked)}
            />
            Log scale
          </label>
        </fieldset>
        <Bars
          title="Finacle history alongside the two new teams"
          unit={
            metric === "people"
              ? "INR · payroll + entered overhead"
              : metric === "effort"
                ? "Person-days · unweighted human effort"
                : "People · historical average engineers vs current crews"
          }
          rows={current}
          log={log}
          money={metric === "people"}
        />
        <p className="comparison-chart-note">
          Different horizons and product breadth: the historical bar is your
          editable lifetime scenario, not a disclosed Infosys total. This is an
          investment comparison, not a speed-up ratio.
        </p>
        <div className="comparison-six">
          <Bars
            money
            title="All six combinations · people budget"
            unit={`INR · ${input.weeks} weeks · each approach’s chosen team size`}
            rows={six.map((s) => ({
              label: s.label,
              value: s.result.peopleInr,
              tone: s.tone,
            }))}
          />
          <Bars
            title="All six combinations · AI allowance"
            unit={`USD · ${input.weeks} weeks · no currency conversion`}
            rows={six.map((s) => ({
              label: s.label,
              value: s.result.aiUsd,
              tone: s.tone,
              detail: `${number(s.result.tokensM)}M tokens`,
            }))}
          />
        </div>
        <figure className="comparison-timeline">
          <figcaption>
            <strong>All six combinations · delivery range</strong>
            <span>
              Weeks for the selected brief · coloured line = optimistic to
              cautious bound
            </span>
          </figcaption>
          {six.map((s) => (
            <div key={s.label}>
              <span>{s.label}</span>
              <strong>{weeks(s.result.lowWeeks, s.result.highWeeks)}</strong>
              <div className="comparison-timeline-track" aria-hidden="true">
                <i
                  style={{
                    left: `${Math.min(100, (input.weeks / Math.max(input.weeks, ...six.map((x) => x.result.highWeeks ?? 0))) * 100)}%`,
                  }}
                />
                <span
                  className={s.tone}
                  style={{
                    left: `${((s.result.lowWeeks ?? 0) / Math.max(input.weeks, ...six.map((x) => x.result.highWeeks ?? 0))) * 100}%`,
                    width: `${(Math.max(0, (s.result.highWeeks ?? 0) - (s.result.lowWeeks ?? 0)) / Math.max(input.weeks, ...six.map((x) => x.result.highWeeks ?? 0))) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <p>
            The vertical marker is your {input.weeks}-week window. No preferred
            team is selected.
          </p>
        </figure>
      </section>
      <details className="comparison-details comparison-history-controls">
        <summary>
          Model Finacle’s lifetime investment{" "}
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div>
          <p>
            Reported cumulative salaries and overhead were not established by
            the sources reviewed. Explore a lifetime scenario with explicit
            average engineering headcount and historical pay. Business-unit
            snapshots are context, not engineering headcount measurements.
          </p>
          <div className="comparison-history-inputs">
            <Slider
              id="history-years"
              label="Product years modelled"
              value={history.years}
              min={5}
              max={35}
              onChange={(years) => setHistory({ ...history, years })}
            />
            <Slider
              id="history-engineers"
              label="Assumed average engineering team"
              value={history.engineers}
              min={50}
              max={3000}
              step={50}
              onChange={(engineers) => setHistory({ ...history, engineers })}
            />
            <Slider
              id="history-pay"
              label="Assumed average historical monthly pay"
              value={history.monthlyPay}
              min={10000}
              max={300000}
              step={1000}
              display={inr(history.monthlyPay)}
              onChange={(monthlyPay) => setHistory({ ...history, monthlyPay })}
            />
            <Slider
              id="history-overhead"
              label="Historical overhead assumption"
              value={history.overhead * 100}
              max={200}
              display={`${number(history.overhead * 100)}%`}
              onChange={(n) => setHistory({ ...history, overhead: n / 100 })}
            />
            <Slider
              id="history-sensitivity"
              label="Sensitivity around total cost"
              value={history.sensitivity * 100}
              max={90}
              display={`±${number(history.sensitivity * 100)}%`}
              onChange={(n) => setHistory({ ...history, sensitivity: n / 100 })}
            />
          </div>
          <dl className="comparison-history-totals">
            <div>
              <dt>Modelled engineering salaries</dt>
              <dd>{compactInr(past.salary)}</dd>
            </div>
            <div>
              <dt>Entered overhead</dt>
              <dd>{compactInr(past.overhead)}</dd>
            </div>
            <div>
              <dt>Modelled lifetime cost</dt>
              <dd>{compactInr(past.total)}</dd>
            </div>
            <div>
              <dt>Sensitivity range · not statistical confidence</dt>
              <dd>
                {compactInr(past.low)}–{compactInr(past.high)}
              </dd>
            </div>
            <div>
              <dt>Modelled engineering effort</dt>
              <dd>{number(past.personDays)} person-days</dd>
            </div>
          </dl>
          <p>
            Defaults: 26 years since the 2000 launch, 400 average engineers,
            ₹70,000 average historical monthly pay, 220 working days/year and
            50% overhead. Headcount, pay and overhead are illustrative inputs,
            not Infosys disclosures. The 1993 predecessor would span 33 years to
            2026. Customer implementation programmes, acquisitions and unentered
            expenses are excluded.
          </p>
        </div>
      </details>
      <details className="comparison-details">
        <summary>
          Pay, working days & hypothetical impact{" "}
          <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="comparison-impact-controls">
          {(
            [
              { key: "intern", label: "Intern monthly pay · INR" },
              { key: "developer", label: "Experienced monthly pay · INR" },
              { key: "expert", label: "Expert monthly pay · INR" },
            ] as const
          ).map((p) => (
            <Numeric
              key={p.key}
              id={`pay-${p.key}`}
              label={p.label}
              value={input.pay[p.key]}
              onChange={(n) => update("pay", { ...input.pay, [p.key]: n })}
            />
          ))}
          <Slider
            id="working-days"
            label="Working days per week"
            value={input.daysPerWeek}
            min={3}
            max={6}
            onChange={(n) => update("daysPerWeek", n)}
          />
          <Numeric
            id="comparison-benefit"
            label="Assumed monthly benefit after launch · INR"
            value={benefit}
            onChange={setBenefit}
          />
          <Numeric
            id="comparison-running"
            label="Additional monthly running cost · INR"
            value={running}
            onChange={setRunning}
          />
          <Numeric
            id="comparison-fx"
            label="Your explicit INR per USD rate"
            max={1000}
            value={fx}
            onChange={setFx}
          />
          <div className="comparison-impact">
            {[
              { id: "A", r: resultA },
              { id: "B", r: resultB },
            ].map(({ id, r }) => {
              const impact = impactScenario(r, benefit, running, fx || null);
              return (
                <div key={id}>
                  <h4>Team {id} · 12 months after a hypothetical launch</h4>
                  {impact ? (
                    <>
                      <p>
                        Planned-window upfront cost:{" "}
                        <strong>{inr(impact.upfront)}</strong>
                      </p>
                      <p>
                        Scenario ROI <strong>{number(impact.roi)}%</strong> ·{" "}
                        {impact.payback === null
                          ? "No positive payback"
                          : `${number(impact.payback)} months payback`}
                      </p>
                    </>
                  ) : (
                    <p>
                      Enter a monthly benefit and your exchange rate to
                      calculate. No benefit or conversion is assumed.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p>
            ROI uses the selected-window payroll and AI allowance, not an
            automatic full-delivery budget. If work takes longer, extend the
            window before judging cost or returns. No launch date, realised
            benefit or investment outcome is promised.
          </p>
        </div>
      </details>
      <div className="comparison-responsibilities">
        <div>
          <h4>People own the outcome</h4>
          <p>
            Scope, financial rules, architecture, consent, review,
            reconciliation and final acceptance. Expert capacity remains
            necessary for human control work.
          </p>
        </div>
        <div>
          <h4>AI contributes drafts</h4>
          <p>
            Research, implementation alternatives, code, interface ideas, tests
            and documentation. Task share is not authorship or accountability.
          </p>
        </div>
      </div>
      <p className="comparison-source-note">
        API rates dated 18 October 2026. Standard short-context API usage,
        including entered cache writes; tools, hosting, subscriptions, taxes and
        special tiers excluded. No purchases or AI calls.{" "}
        <a href="/build-story#assumptions">
          Explore every formula and source{" "}
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}
