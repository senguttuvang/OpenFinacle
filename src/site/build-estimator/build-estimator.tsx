"use client";

import { useState } from "react";
import { FormSelect } from "../../platform/form-controls/form-select";
import {
  calculateTeam,
  defaultTeam,
  recipeModels,
  type TeamInput,
} from "../build-story/build-recipe-model";
import { NumberField } from "./number-field";
import { EstimatorResults } from "./results";
import { comparisonFor, estimatorScenarios } from "./scenarios";
import { TeamControls } from "./team-controls";
import "./estimator.css";

export function BuildEstimator({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "div" : "main";
  const Title = embedded ? "h3" : "h1";
  const [scenarioId, setScenarioId] = useState("prototype");
  const [weeks, setWeeks] = useState(10);
  const [a, setA] = useState(() => defaultTeam("A"));
  const [b, setB] = useState(() => defaultTeam("B"));
  const [tokensA, setTokensA] = useState(5);
  const [tokensB, setTokensB] = useState(500);
  const [pay, setPay] = useState({
    intern: 30000,
    developer: 100000,
    expert: 300000,
  });
  const scenario =
    estimatorScenarios.find((item) => item.id === scenarioId) ??
    estimatorScenarios[0];
  const input = { ...comparisonFor(scenario, weeks), pay };
  const withUsage = (team: TeamInput, tokens: number): TeamInput => ({
    ...team,
    funding: "tokens",
    dailyTokensM:
      tokens /
      Math.max(
        1,
        (team.interns + team.developers + team.experts) *
          weeks *
          input.daysPerWeek,
      ),
  });
  const resultA = calculateTeam(withUsage(a, tokensA), input);
  const resultB = calculateTeam(withUsage(b, tokensB), input);
  return (
    <Container className={`build-estimator${embedded ? " est-embedded" : ""}`}>
      {!embedded && (
        <header className="est-header">
          <a href="/discover">
            OpenFinacle <span>/ Build estimator</span>
          </a>
          <a href="/build-story#assumptions">Full model & evidence ↗</a>
        </header>
      )}
      <div className="est-title">
        <div>
          <p className="est-kicker">Software-building investment</p>
          <Title>Compare the plan, with the scope in view.</Title>
        </div>
        <p>
          Illustrative engineering scenarios.
          <br />
          No vendor quote or readiness score.
        </p>
      </div>
      <section className="est-scope" aria-label="Common comparison basis">
        <div>
          <strong>Common basis for Team A & B</strong>
          <p>{scenario.basis}</p>
        </div>
        <div>
          <p>
            <strong>Included</strong> {scenario.included}
          </p>
          <p>
            <strong>Outside this estimate</strong> {scenario.excluded}
          </p>
        </div>
      </section>
      <div className="est-workbench">
        <section className="est-inputs" aria-label="Planning assumptions">
          <h2>Set the assumptions</h2>
          <label className="est-select">
            Scenario
            <FormSelect
              aria-label="Scenario"
              value={scenarioId}
              onValueChange={setScenarioId}
              options={estimatorScenarios.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </label>
          <NumberField
            label="Planning window (weeks)"
            value={weeks}
            max={260}
            onChange={(value) => setWeeks(Math.max(1, Math.round(value)))}
          />
          <TeamControls
            name="A"
            team={a}
            tokens={tokensA}
            onChange={setA}
            onTokens={setTokensA}
          />
          <TeamControls
            name="B"
            team={b}
            tokens={tokensB}
            onChange={setB}
            onTokens={setTokensB}
          />
          <button
            className="est-token-preset"
            type="button"
            onClick={() => setTokensB(100000)}
          >
            Try 100 billion planned tokens for B
          </button>
          <p className="est-footnote">
            Planned allowances · 5 days/week. INR and USD stay separate.
          </p>
        </section>
        <EstimatorResults
          a={resultA}
          b={resultB}
          weeks={weeks}
          scenario={scenario}
        />
      </div>
      <details className="est-advanced">
        <summary>Inspect assumptions, rates & sources</summary>
        <div className="est-advanced-grid">
          <section>
            <h2>Shared monthly pay · INR</h2>
            {(["intern", "developer", "expert"] as const).map((role) => (
              <NumberField
                key={role}
                label={`${role} monthly INR`}
                value={pay[role]}
                max={10000000}
                onChange={(value) => setPay({ ...pay, [role]: value })}
              />
            ))}
            <p>
              Talent weights: intern 0.35, developer 1, expert 1.3 reference
              days/day. These are uncalibrated assumptions. Human allocation is
              unweighted person-days; modelled work uses reference
              developer-days.
            </p>
          </section>
          {[
            { name: "A", team: a, set: setA },
            { name: "B", team: b, set: setB },
          ].map(({ name, team, set }) => (
            <section key={name}>
              <h2>Team {name} · adjustable hypotheses</h2>
              {(["interns", "developers", "experts"] as const).map((role) => (
                <NumberField
                  key={role}
                  label={`Team ${name} ${role}`}
                  value={team[role]}
                  max={100}
                  onChange={(value) =>
                    set({ ...team, [role]: Math.round(value) })
                  }
                />
              ))}
              {(
                [
                  ["aiShare", "AI-assisted drafting"],
                  ["draftSaving", "Saving on assisted drafting"],
                  ["review", "Review added on assisted drafting"],
                  ["coordination", "Coordination allowance"],
                  ["overhead", "Payroll overhead"],
                  ["outputShare", "Output token share"],
                  ["cachedShare", "Cached share of input"],
                ] as const
              ).map(([key, label]) => (
                <NumberField
                  key={key}
                  label={`Team ${name} ${label} (%)`}
                  value={Math.round(team[key] * 100)}
                  max={key === "coordination" ? 95 : 100}
                  onChange={(value) => set({ ...team, [key]: value / 100 })}
                />
              ))}
              <p>
                Role counts above are authoritative; the talent-mix control
                applies a preset. Cache writes are zero. Changing tokens or
                token mix changes spend only.
              </p>
            </section>
          ))}
        </div>
        <div className="est-method">
          <h2>How to read this estimate</h2>
          <p>
            Shared module ranges × scope factor × (1 − AI drafting share ×
            drafting saving + AI drafting share × review). Pilot expert controls
            add 200–500 expert-days; each occupies 1.3 reference days. Delivery
            checks total capacity and expert capacity separately. No experts
            blocks control-bearing scopes. Zero people or AI assistance without
            tokens blocks delivery estimates. These are scenario envelopes, not
            confidence intervals.
          </p>
          <p>
            API snapshot · 18 October 2026 · {recipeModels[0].name}, standard
            short context: US${recipeModels[0].input}/M fresh input, US$
            {recipeModels[0].cached}/M cached input, US${recipeModels[0].output}
            /M output. A defaults to 10% output, B to 20%; remaining tokens are
            input. Blended rates: US${resultA.blended.toFixed(2)}/M for A; US$
            {resultB.blended.toFixed(2)}/M for B. Subscription plans, tools,
            hosting and taxes excluded.{" "}
            <a href={recipeModels[0].source}>Official API pricing ↗</a>
          </p>
          <p>
            Founder account: roughly one week and 500 million tokens to reach
            the prototype; self-reported and not audited. It reuses Apache
            Fineract. This does not calibrate productivity, establish Finacle
            parity or include delivered chatbot/MCP/wealth execution.
          </p>
          <p>
            Research:{" "}
            <a href="https://plane.so/pricing">Plane savings calculator</a>{" "}
            informed the compact inputs/totals layout;{" "}
            <a href="https://aws.amazon.com/calculator/calculator-assumptions/">
              AWS calculator assumptions
            </a>{" "}
            informed the visible estimate boundary.{" "}
            <a href="https://www.finacle.com/solution/core-banking-solution/">
              Finacle product reference
            </a>{" "}
            provides product context; reviewed pages establish no bank-specific
            acquisition/run price.
          </p>
        </div>
      </details>
    </Container>
  );
}
