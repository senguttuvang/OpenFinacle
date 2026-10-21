import { ChevronDown, Users } from "lucide-react";
import { useState } from "react";
import { FormSelect } from "../../platform/form-controls/form-select";
import {
  type ComparisonInput,
  calculateTeam,
  compositions,
  crewFor,
  recipeModels,
  type TeamInput,
} from "./build-recipe-model";
import "./build-comparison.css";
export const number = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: Math.abs(n) > 0 && Math.abs(n) < 1 ? 3 : 1,
  }).format(n);

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export const usd = (n: number) =>
  `US$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}`;

export const compactInr = (n: number) =>
  n >= 10000000 ? `₹${number(n / 10000000)} crore` : inr(n);

export const weeks = (low: number | null, high: number | null) =>
  low === null || high === null
    ? "No delivery range"
    : `${number(low)}–${number(high)} weeks`;

export function Slider({
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

export function Numeric({
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

export function Bars({
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
          const value = log ? (max + 1) ** fraction - 1 : max * fraction;
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

export function TeamEditor({
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
          onChange={(n) => update("dailyTokensM", (10 ** n - 1) / 1000)}
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
