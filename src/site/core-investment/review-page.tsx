"use client";

import { useState } from "react";
import { Decision } from "./decision";
import { Editorial } from "./editorial";
import { Ledger } from "./ledger";
import { defaultCorePlan, finacleCore } from "./model";
import { ScopeLine } from "./shared";
import { Timeline } from "./timeline";
import { Workbench } from "./workbench";
import "./review.css";

const variants = [
  {
    id: "editorial",
    name: "Editorial",
    description: "A clear story with the two investments facing each other.",
    Component: Editorial,
  },
  {
    id: "ledger",
    name: "Ledger",
    description: "A direct row-by-row comparison, with no competing panels.",
    Component: Ledger,
  },
  {
    id: "workbench",
    name: "Workbench",
    description:
      "Sliders on the left. Your investment takes the lead on the right.",
    Component: Workbench,
  },
  {
    id: "timeline",
    name: "Timeline",
    description:
      "The working foundation, the next build and the core experience ahead.",
    Component: Timeline,
  },
  {
    id: "decision",
    name: "Decision brief",
    description:
      "A concise investment proposal with its controls in one horizontal strip.",
    Component: Decision,
  },
] as const;

export function CoreInvestmentReview() {
  const [plans, setPlans] = useState(
    variants.map(() => ({ ...defaultCorePlan })),
  );
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <main className="core-review">
      <header className="ci-page-header">
        <a href="/discover">OpenFinacle</a>
        <span>Core investment · design review</span>
      </header>
      <div className="ci-page-intro">
        <h1>
          One core product.
          <br />
          Five ways to compare the build.
        </h1>
        <p>
          Finacle’s inferred core investment beside one AI-first team. Start at
          five full-time people for ten weeks, then try a five-month plan.
        </p>
      </div>
      <nav className="ci-jump" aria-label="Review variations">
        {variants.map((v, index) => (
          <a href={`#${v.id}`} key={v.id}>
            {index + 1}. {v.name}
          </a>
        ))}
      </nav>
      <div className="ci-common-scope">
        <ScopeLine />
        <p>
          Every section has its own sliders so you can compare layouts using
          different scenarios. Finacle figures are inferred; AI-first figures
          are planning budgets.
        </p>
      </div>
      {variants.map(({ id, name, description, Component }, index) => (
        <section
          className={`ci-review-section ci-review-${id}`}
          id={id}
          key={id}
          aria-labelledby={`${id}-title`}
        >
          <header className="ci-variant-header">
            <div>
              <h2 id={`${id}-title`}>
                {index + 1}. {name}
              </h2>
              <p>{description}</p>
            </div>
            <button
              type="button"
              aria-pressed={selected === id}
              onClick={() => setSelected(id)}
            >
              {selected === id
                ? "Selected for discussion"
                : "Choose this direction"}
            </button>
          </header>
          <Component
            plan={plans[index]}
            onChange={(next) =>
              setPlans((current) =>
                current.map((plan, i) => (i === index ? next : plan)),
              )
            }
          />
          <ScopeLine />
        </section>
      ))}
      <section className="ci-evidence" id="evidence">
        <h2>The assumptions behind every version.</h2>
        <div className="ci-evidence-grid">
          <section>
            <h3>Finacle core · inferred</h3>
            <p>
              Infosys reported over US$60M invested over three years and over
              240,000 person-days for Finacle 10 in 2008. That release also
              included wealth, mobile and other capabilities.
            </p>
            <p>
              For this core-only scenario, allocate 50%: roughly US$30M and
              120,000 person-days. At 220 days/year over three years, that is
              about 180 equivalent full-time people. A 35–70% allocation instead
              gives US$21M–42M and roughly 127–255 equivalent people.
            </p>
            <p>
              This is an illustrative allocation of disclosed lower-bound
              anchors, not a reported core-only budget, actual headcount,
              lifetime total or acquisition price. Historical USD is nominal. No
              saving or parity ratio is calculated.
            </p>
            <a href={finacleCore.source}>Finacle 10 · primary announcement ↗</a>
          </section>
          <section>
            <h3>AI-first · from this foundation</h3>
            <p>
              Existing work includes Fineract-backed accounts/postings, selected
              loan flows, deposits and customer/branch journeys. The founder’s
              roughly one-week/500M-token account is self-reported, not a
              measured productivity baseline.
            </p>
            <p>
              The estimate reserves the canonical accounts, branch, products,
              reconciliation, lending and operations ranges for completion,
              rework and hardening: about 315–663 reference days under the
              existing AI/review hypotheses. Default five-person crew: one
              banking expert and four experienced developers, all full-time.
              Coordination/review still consume capacity.
            </p>
            <p>
              The resulting roughly 14–30-week range is an engineering planning
              hypothesis for a coherent experience on Fineract. It does not fund
              writing a new ledger engine or establish a bank-ready core.
              Migration, regulated deployment, external integrations and
              independent assurance remain a separate program.
            </p>
            <a href="/build-story#assumptions">
              Canonical effort assumptions ↗
            </a>
          </section>
          <section>
            <h3>People, accounts & billing</h3>
            <p>
              Default monthly pay: ₹100,000 per person, adjustable. People cost
              uses weeks × 12/52 months. Human effort uses five working
              days/week and eight hours/day per full-time person.
            </p>
            <p>
              Default: three Codex US$200 accounts and one Claude US$200
              account, US$800/month. Ten weeks spans three monthly billing
              periods: US$2,400. Exactly five months costs US$4,000. Two Codex
              plus one Claude is US$600/month. Optional API spend is added
              separately; any included Claude API credit is not added again.
            </p>
            <p>
              Subscriptions use whole monthly billing periods; API allowance and
              payroll follow elapsed time. Prices checked 18 October 2026,
              before tax. Usage limits apply; accounts do not guarantee a token
              quantity or delivery speed. INR and USD remain separate. Hosting,
              taxes and other tools are excluded.
            </p>
            <a href="https://learn.chatgpt.com/docs/pricing">
              Official Codex pricing ↗
            </a>
            <a href="https://support.claude.com/en/articles/11049741-what-is-the-max-plan">
              Claude plan pricing ↗
            </a>
          </section>
        </div>
      </section>
      <footer className="ci-page-footer" aria-live="polite">
        {selected
          ? `Your current choice: ${variants.find((v) => v.id === selected)?.name}. Tell me what to keep or change.`
          : "Review all five sections, then choose the direction you want to refine."}
      </footer>
    </main>
  );
}
