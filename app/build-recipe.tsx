"use client";

import { ArrowRight, Check, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  calculateRecipe,
  type RecipeInput,
  reasoningMix,
  recipeModels,
  recipeModules,
} from "./build-recipe-model";
import { FormSelect } from "./form-select";

const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
const usd = (value: number) =>
  `US${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)}`;
const defaults: RecipeInput = {
  interns: 2,
  developers: 2,
  experts: 1,
  months: 3,
  approach: "assisted",
  scope: "rebuild",
  modules: ["accounts", "branch", "planning"],
  model: "sol",
  reasoning: "medium",
  cachedShare: 0.5,
  funding: "tokens",
  tokensB: 1,
  budgetUsd: 5000,
  aiTaskShare: 0.4,
  draftSaving: 0.2,
  coordination: 0.15,
  overhead: 0,
  monthlyBenefitInr: 0,
  monthlyRunningInr: 0,
  fxInrPerUsd: null,
};
function NumberInput({
  id,
  label,
  value,
  onChange,
  max = 10000000,
  placeholder,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  max?: number;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const shown = raw ?? (value === null || value === 0 ? "" : String(value));
  const invalid =
    shown !== "" &&
    (!Number.isFinite(Number(shown)) ||
      Number(shown) < 0 ||
      Number(shown) > max);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min="0"
        max={max}
        value={shown}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => {
          const next = e.target.value;
          setRaw(next);
          const number = Number(next);
          if (next === "") onChange(null);
          else if (Number.isFinite(number) && number >= 0 && number <= max)
            onChange(number);
        }}
      />
      {invalid && (
        <span id={`${id}-error`} className="recipe-input-error">
          Choose a value between 0 and {max.toLocaleString("en-IN")}. The last
          valid value stays in the recipe.
        </span>
      )}
    </div>
  );
}
export function BuildRecipe() {
  const [input, setInput] = useState<RecipeInput>(defaults);
  const [step, setStep] = useState("crew");
  const update = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) =>
    setInput((previous) => ({ ...previous, [key]: value }));
  const r = calculateRecipe(input);
  const preset = (kind: "interns" | "mixed" | "experienced" | "experts") =>
    setInput((previous) => ({
      ...previous,
      interns: kind === "interns" ? 5 : kind === "mixed" ? 2 : 0,
      developers:
        kind === "interns"
          ? 1
          : kind === "mixed"
            ? 2
            : kind === "experienced"
              ? 4
              : 2,
      experts: kind === "experts" ? 3 : 1,
    }));
  const range =
    r.lowMonths !== null && r.highMonths !== null
      ? `${Math.ceil(r.lowMonths)}–${Math.ceil(r.highMonths)} months`
      : null;
  const resultTitle =
    input.scope === "core"
      ? "A bigger programme, a different conversation."
      : !r.people
        ? "First, bring your people."
        : !r.selected.length
          ? "Choose the part you want to build."
          : r.capacity < r.low
            ? "Start smaller, or give the team more room."
            : r.capacity < r.high
              ? "There’s room for a focused version."
              : "Your recipe covers the modelled effort range.";
  return (
    <div className="build-recipe">
      <div className="recipe-presets">
        <span>Try a team mix</span>
        <button type="button" onClick={() => preset("interns")}>
          Mostly interns
        </button>
        <button type="button" onClick={() => preset("mixed")}>
          Mixed talents
        </button>
        <button type="button" onClick={() => preset("experienced")}>
          Mostly experienced
        </button>
        <button type="button" onClick={() => preset("experts")}>
          Expert-led
        </button>
      </div>
      <div className="recipe-workbench">
        <div className="recipe-controls">
          <a className="recipe-mobile-summary" href="#recipe-result">
            View your recipe · {inr(r.payrollInr)} team + {usd(r.aiUsd)} AI{" "}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
          <nav className="recipe-steps" aria-label="Build recipe choices">
            {[
              ["crew", "People"],
              ["scope", "Ambition"],
              ["ai", "AI & approach"],
              ["value", "Impact & ROI"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={step === id}
                onClick={() => setStep(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {step === "crew" && (
            <section className="recipe-step" aria-label="People choices">
              <h3>Your people make the difference.</h3>
              <p>
                Choose the mix. These are monthly pay assumptions, not fully
                loaded employment costs.
              </p>
              <div className="recipe-team-sliders">
                {[
                  ["interns", "Interns", "₹30,000 / month"],
                  ["developers", "Experienced developers", "₹1,00,000 / month"],
                  ["experts", "Domain / platform experts", "₹3,00,000 / month"],
                ].map(([key, label, pay]) => (
                  <div key={key}>
                    <label htmlFor={`recipe-${key}`}>
                      {label}
                      <strong>
                        {input[key as "interns" | "developers" | "experts"]}
                      </strong>
                    </label>
                    <span className="recipe-pay">{pay}</span>
                    <input
                      id={`recipe-${key}`}
                      type="range"
                      min="0"
                      max="10"
                      value={input[key as "interns" | "developers" | "experts"]}
                      onChange={(e) =>
                        update(
                          key as "interns" | "developers" | "experts",
                          Number(e.target.value),
                        )
                      }
                    />
                  </div>
                ))}
              </div>
              <label htmlFor="recipe-months">
                Time together <strong>{input.months} months</strong>
              </label>
              <input
                id="recipe-months"
                type="range"
                min="1"
                max="24"
                value={input.months}
                onChange={(e) => update("months", Number(e.target.value))}
              />
              <label htmlFor="recipe-overhead">
                Add your payroll overhead assumption{" "}
                <strong>{Math.round(input.overhead * 100)}%</strong>
              </label>
              <input
                id="recipe-overhead"
                type="range"
                min="0"
                max="50"
                step="5"
                value={input.overhead * 100}
                onChange={(e) =>
                  update("overhead", Number(e.target.value) / 100)
                }
              />
              <button
                className="recipe-next"
                type="button"
                onClick={() => setStep("scope")}
              >
                Choose the ambition <ArrowRight size={17} aria-hidden="true" />
              </button>
            </section>
          )}
          {step === "scope" && (
            <section className="recipe-step" aria-label="Scope choices">
              <h3>How much are you rebuilding?</h3>
              <label htmlFor="recipe-scope">Starting point & maturity</label>
              <FormSelect
                id="recipe-scope"
                value={input.scope}
                onValueChange={(value) =>
                  update("scope", value as RecipeInput["scope"])
                }
                options={[
                  { value: "extend", label: "Extend this prototype" },
                  { value: "rebuild", label: "Rebuild comparable journeys" },
                  {
                    value: "production",
                    label: "Build a production foundation",
                  },
                  { value: "core", label: "Replace a broad banking core" },
                ]}
              />
              <p className="recipe-hint">
                {input.scope === "extend"
                  ? "Reuse this app and Fineract; focus on the next selected capabilities."
                  : input.scope === "rebuild"
                    ? "Independently rebuild a comparable application on an existing Fineract core; not a new core or complete vendor parity."
                    : input.scope === "production"
                      ? "Add bank controls and operational foundations. External approvals and integration access can extend the modelled time."
                      : "A broad Finacle-like replacement needs institution-specific discovery. This small-team model does not estimate it."}
              </p>
              <fieldset className="recipe-focus">
                <legend>Pick the capabilities to explore</legend>
                {recipeModules.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={input.modules.includes(item.id)}
                      onChange={() =>
                        update(
                          "modules",
                          input.modules.includes(item.id)
                            ? input.modules.filter((value) => value !== item.id)
                            : [...input.modules, item.id],
                        )
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
              </fieldset>
              <p className="recipe-hint">
                Selecting a capability adds modelled work; it does not mean the
                prototype already has its complete production lifecycle. AI/MCP
                channels are proposed scope.
              </p>
              <button
                className="recipe-next"
                type="button"
                onClick={() => setStep("ai")}
              >
                Choose how you’ll work{" "}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </section>
          )}
          {step === "ai" && (
            <section className="recipe-step" aria-label="AI choices">
              <h3>A companion. An approach. A budget.</h3>
              <fieldset className="recipe-choice">
                <legend>Working style</legend>
                <button
                  type="button"
                  aria-pressed={input.approach === "assisted"}
                  onClick={() =>
                    setInput((p) => ({
                      ...p,
                      approach: "assisted",
                      aiTaskShare: 0.4,
                    }))
                  }
                >
                  AI-assisted
                </button>
                <button
                  type="button"
                  aria-pressed={input.approach === "native"}
                  onClick={() =>
                    setInput((p) => ({
                      ...p,
                      approach: "native",
                      aiTaskShare: 0.75,
                    }))
                  }
                >
                  AI-first / native
                </button>
              </fieldset>
              <p className="recipe-hint">
                {input.approach === "assisted"
                  ? "People lead implementation; AI helps with bounded drafting and alternatives."
                  : "Design work around AI-assisted drafts and iteration; people own architecture, financial decisions, review and release."}
              </p>
              <label htmlFor="recipe-model">AI model</label>
              <FormSelect
                id="recipe-model"
                value={input.model}
                onValueChange={(value) =>
                  update("model", value as RecipeInput["model"])
                }
                options={recipeModels.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
              />
              <fieldset className="recipe-choice">
                <legend>Reasoning level</legend>
                {Object.entries(reasoningMix).map(([id, item]) => (
                  <button
                    type="button"
                    key={id}
                    aria-pressed={input.reasoning === id}
                    onClick={() =>
                      update("reasoning", id as RecipeInput["reasoning"])
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </fieldset>
              <fieldset className="recipe-choice">
                <legend>AI allowance for the whole plan</legend>
                <button
                  type="button"
                  aria-pressed={input.funding === "tokens"}
                  onClick={() => update("funding", "tokens")}
                >
                  Start with tokens
                </button>
                <button
                  type="button"
                  aria-pressed={input.funding === "budget"}
                  onClick={() => update("funding", "budget")}
                >
                  Start with a budget
                </button>
              </fieldset>
              {input.funding === "tokens" ? (
                <>
                  <label htmlFor="recipe-tokens">
                    Token allowance <strong>{input.tokensB} billion</strong>
                  </label>
                  <input
                    id="recipe-tokens"
                    type="range"
                    min=".1"
                    max="100"
                    step=".1"
                    value={input.tokensB}
                    onChange={(e) => update("tokensB", Number(e.target.value))}
                  />
                </>
              ) : (
                <>
                  <label htmlFor="recipe-budget">
                    AI budget · USD <strong>{usd(input.budgetUsd)}</strong>
                  </label>
                  <input
                    id="recipe-budget"
                    type="range"
                    min="100"
                    max="100000"
                    step="100"
                    value={input.budgetUsd}
                    onChange={(e) =>
                      update("budgetUsd", Number(e.target.value))
                    }
                  />
                </>
              )}
              <label htmlFor="recipe-ai-share">
                Drafting tasks assigned AI assistance{" "}
                <strong>{Math.round(input.aiTaskShare * 100)}%</strong>
              </label>
              <input
                id="recipe-ai-share"
                type="range"
                min="0"
                max="90"
                step="5"
                value={input.aiTaskShare * 100}
                onChange={(e) =>
                  update("aiTaskShare", Number(e.target.value) / 100)
                }
              />
              <div className="recipe-mix" aria-hidden="true">
                <span style={{ flex: 1 - input.aiTaskShare }}>
                  People {Math.round((1 - input.aiTaskShare) * 100)}%
                </span>
                <span style={{ flex: input.aiTaskShare }}>
                  AI {Math.round(input.aiTaskShare * 100)}%
                </span>
              </div>
              <p className="recipe-hint">
                Task allocation, not measured authorship. Human accountability
                stays at 100%.
              </p>
              <details className="recipe-fine-tune">
                <summary>Adjust the working assumptions</summary>
                <label htmlFor="recipe-saving">
                  Assumed saving on AI-assisted drafting{" "}
                  <strong>{Math.round(input.draftSaving * 100)}%</strong>
                </label>
                <input
                  id="recipe-saving"
                  type="range"
                  min="0"
                  max="40"
                  step="5"
                  value={input.draftSaving * 100}
                  onChange={(e) =>
                    update("draftSaving", Number(e.target.value) / 100)
                  }
                />
                <p>
                  A hypothesis to explore, not a measured AI gain. The model
                  also adds 10% review effort on that task share.
                </p>
                <label htmlFor="recipe-coordination">
                  Team learning & coordination allowance{" "}
                  <strong>{Math.round(input.coordination * 100)}%</strong>
                </label>
                <input
                  id="recipe-coordination"
                  type="range"
                  min="0"
                  max="40"
                  step="5"
                  value={input.coordination * 100}
                  onChange={(e) =>
                    update("coordination", Number(e.target.value) / 100)
                  }
                />
                <label htmlFor="recipe-cache">
                  Cached share of input tokens{" "}
                  <strong>{Math.round(input.cachedShare * 100)}%</strong>
                </label>
                <input
                  id="recipe-cache"
                  type="range"
                  min="0"
                  max="90"
                  step="10"
                  value={input.cachedShare * 100}
                  onChange={(e) =>
                    update("cachedShare", Number(e.target.value) / 100)
                  }
                />
                <p>
                  Low/medium use assumed 10%/20% generated-token shares,
                  including reasoning. Per-token rates do not change with the
                  reasoning label.
                </p>
              </details>
              <button
                className="recipe-next"
                type="button"
                onClick={() => setStep("value")}
              >
                Explore impact & ROI <ArrowRight size={17} aria-hidden="true" />
              </button>
            </section>
          )}
          {step === "value" && (
            <section className="recipe-step" aria-label="Impact choices">
              <h3>What would success be worth?</h3>
              <p>
                Enter your own monthly benefit and running-cost assumptions.
                Nothing is inferred from a feature count.
              </p>
              <NumberInput
                id="recipe-benefit"
                label="Expected monthly benefit · INR"
                value={input.monthlyBenefitInr}
                onChange={(value) => update("monthlyBenefitInr", value ?? 0)}
                placeholder="Your assumption, e.g. avoided cost or added margin"
              />
              <NumberInput
                id="recipe-running"
                label="Additional monthly running cost · INR"
                value={input.monthlyRunningInr}
                onChange={(value) => update("monthlyRunningInr", value ?? 0)}
                placeholder="Include support, infrastructure and maintenance"
              />
              <NumberInput
                id="recipe-fx"
                label="Your exchange-rate assumption · INR per USD"
                value={input.fxInrPerUsd}
                onChange={(value) =>
                  update("fxInrPerUsd", value && value > 0 ? value : null)
                }
                max={1000}
                placeholder="Required to combine INR payroll and USD API spend"
              />
              <p className="recipe-hint">
                An entered rate explicitly converts the displayed USD API
                allowance into INR. It is your scenario rate, not a live
                exchange rate. Without it, the two currencies remain separate.
              </p>
              <p>
                ROI considers 12 months of the entered net benefit against the
                selected team-and-time budget, including the whole-plan AI
                allowance once. It excludes unentered costs and does not
                establish financial feasibility.
              </p>
            </section>
          )}
        </div>
        <aside
          className={`recipe-result ${input.scope}`}
          aria-label="Your build recipe"
          id="recipe-result"
        >
          <div className="recipe-result-top">
            <span>Your build recipe</span>
            <Sparkles size={20} aria-hidden="true" />
          </div>
          <h3>{resultTitle}</h3>
          <div aria-live="polite" aria-atomic="true">
            <p className="recipe-result-scope">
              {r.selected.map((item) => item.name).join(" · ") ||
                "No capabilities selected"}
            </p>
            <dl>
              <div>
                <dt>Your crew</dt>
                <dd>
                  {r.people} people · {input.months} months
                </dd>
              </div>
              <div>
                <dt>Monthly salaries</dt>
                <dd>{inr(r.monthlyPayInr)}</dd>
              </div>
              <div>
                <dt>
                  Team budget{" "}
                  {input.overhead > 0 ? "with overhead" : "· salary only"}
                </dt>
                <dd>{inr(r.payrollInr)}</dd>
              </div>
              <div>
                <dt>AI usage allowance</dt>
                <dd>{usd(r.aiUsd)}</dd>
              </div>
              <div>
                <dt>Token envelope</dt>
                <dd>
                  {r.tokensB.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}
                  B tokens
                </dd>
              </div>
            </dl>
            <div className="recipe-range">
              <span>Illustrative delivery range</span>
              <strong>{range ?? "Needs a scoped discovery"}</strong>
              <p>
                {range
                  ? "A planning range from your chosen assumptions, not a promised date. Bank dependencies can extend it."
                  : "Choose people and capabilities. A broad core replacement remains outside this estimate."}
              </p>
            </div>
            {input.interns > 0 && input.developers + input.experts === 0 && (
              <p className="recipe-owner-note">
                An intern-only team needs an experienced technical lead and
                banking-domain support; capacity arithmetic cannot replace them.
              </p>
            )}
            {input.scope === "production" && (
              <p className="recipe-owner-note">
                Production still needs bank, security, compliance and operations
                owners beyond this development payroll.
              </p>
            )}
            <div className="recipe-impact">
              <h4>Impact & ROI</h4>
              {r.roi === null ? (
                <p>
                  {!r.estimable
                    ? "Choose a team and an estimable scope before exploring returns."
                    : "Add a monthly benefit and your exchange rate in Impact & ROI to explore a 12-month scenario."}
                </p>
              ) : (
                <>
                  <p>
                    Team + AI at your rate{" "}
                    <strong>{inr(r.totalInr ?? 0)}</strong>
                  </p>
                  <p>
                    Illustrative 12-month ROI{" "}
                    <strong>{Math.round(r.roi)}%</strong>
                  </p>
                  <p>
                    Payback{" "}
                    <strong>
                      {r.paybackMonths === null
                        ? "No positive payback"
                        : `${r.paybackMonths.toFixed(1)} months`}
                    </strong>
                  </p>
                  <small>
                    Based only on the assumptions entered. Not an observed
                    return or investment recommendation.
                  </small>
                </>
              )}
            </div>
          </div>
          <details className="recipe-ownership">
            <summary>Who owns what?</summary>
            <strong>
              <Check size={16} aria-hidden="true" /> People own the outcome
            </strong>
            <p>
              Scope, architecture, financial rules, review, customer consent and
              final acceptance.
            </p>
            <strong>
              <Sparkles size={16} aria-hidden="true" /> AI helps with the work
            </strong>
            <p>
              Research and code drafts, interface alternatives, test ideas and
              documentation.
            </p>
          </details>
          <a href="/build-story#assumptions">
            How this recipe is calculated{" "}
            <ArrowRight size={17} aria-hidden="true" />
          </a>
        </aside>
      </div>
      <p className="recipe-footnote">
        Explore assumptions, not promises. Pay scales supplied by the founder;
        API rates dated 18 October 2026. No purchases or AI calls.{" "}
        <a href="/build-story#assumptions">Read the model and its limits</a>.
      </p>
    </div>
  );
}
