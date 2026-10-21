import { useId } from "react";
import { type CorePlan, coreInvestment, formatWeeks, inr, usd } from "./model";

function PlanSlider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number | "any";
  display?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <label className="ci-slider" htmlFor={id}>
      <span>
        <span>{label}</span>
        <output htmlFor={id}>{display ?? value}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function PlanControls({
  plan,
  onChange,
  compact = false,
}: {
  plan: CorePlan;
  onChange: (plan: CorePlan) => void;
  compact?: boolean;
}) {
  const set = (key: keyof CorePlan, value: number) =>
    onChange({ ...plan, [key]: value });
  const result = coreInvestment(plan);
  return (
    <div className={`ci-controls${compact ? " ci-controls-compact" : ""}`}>
      <PlanSlider
        label="Full-time people"
        value={plan.people}
        min={1}
        max={15}
        onChange={(v) => set("people", v)}
      />
      <PlanSlider
        label="Build window"
        value={plan.weeks}
        min={2}
        max={52}
        step="any"
        display={`${formatWeeks(plan.weeks)} weeks`}
        onChange={(v) => set("weeks", Math.round(v))}
      />
      <div className="ci-presets">
        <button
          type="button"
          aria-pressed={plan.weeks === 10}
          onClick={() => set("weeks", 10)}
        >
          10 weeks
        </button>
        <button
          type="button"
          aria-pressed={Math.abs(plan.weeks - 65 / 3) < 0.001}
          onClick={() => set("weeks", 65 / 3)}
        >
          5 months
        </button>
      </div>
      <div className="ci-account-sliders">
        <PlanSlider
          label="Codex accounts"
          value={plan.codex}
          min={0}
          max={5}
          display={`${plan.codex} × $200`}
          onChange={(v) => set("codex", v)}
        />
        <PlanSlider
          label="Claude accounts"
          value={plan.claude}
          min={0}
          max={5}
          display={`${plan.claude} × $200`}
          onChange={(v) => set("claude", v)}
        />
      </div>
      <p className="ci-tools-line">
        {usd(result.monthlySubscriptions)} / month in subscriptions
      </p>
      <details className="ci-extra">
        <summary>Pay & optional API budget</summary>
        <PlanSlider
          label="Pay per person / month"
          value={plan.monthlyPayInr}
          min={30000}
          max={300000}
          step={10000}
          display={inr(plan.monthlyPayInr)}
          onChange={(v) => set("monthlyPayInr", v)}
        />
        <PlanSlider
          label="Extra API / month"
          value={plan.monthlyApiUsd}
          min={0}
          max={5000}
          step={100}
          display={usd(plan.monthlyApiUsd)}
          onChange={(v) => set("monthlyApiUsd", v)}
        />
        <p>
          Accounts are individual subscriptions; API is an additional allowance.
          Included usage has no guaranteed token quantity. No
          token-to-productivity conversion.
        </p>
      </details>
    </div>
  );
}
