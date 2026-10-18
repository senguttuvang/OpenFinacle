import { PlanControls } from "./controls";
import {
  type CorePlan,
  coreInvestment,
  durationRange,
  formatNumber,
  formatWeeks,
  inr,
  usd,
} from "./model";

export function Decision({
  plan,
  onChange,
}: {
  plan: CorePlan;
  onChange: (plan: CorePlan) => void;
}) {
  const r = coreInvestment(plan);
  return (
    <div className="ci-decision">
      <div className="ci-decision-top">
        <div>
          <h3>Fund the next core-banking build.</h3>
          <p>
            A {plan.people}-person AI-first team for {formatWeeks(plan.weeks)}{" "}
            weeks.
          </p>
        </div>
        <div className="ci-decision-price">
          <strong>{inr(r.payrollInr)}</strong>
          <span>people budget</span>
          <b>
            {usd(r.toolUsd)} <small>AI tools, separately</small>
          </b>
        </div>
      </div>
      <PlanControls plan={plan} onChange={onChange} compact />
      <div className="ci-decision-bottom">
        <section>
          <h4>The historical reference</h4>
          <p>
            <strong>~US$30M · ~180 people · 3 years</strong>
          </p>
          <p>
            Inferred Finacle core allocation; ~120,000 person-days. A mature
            product build, with a broader historical foundation.
          </p>
        </section>
        <section>
          <h4>Your investment buys</h4>
          <p>
            <strong>{formatNumber(r.personDays)} full-time person-days</strong>
          </p>
          <p>
            {plan.codex} Codex + {plan.claude} Claude accounts.{" "}
            {usd(r.monthlyTools)} per month; {r.billingMonths} billed months in
            this plan.
          </p>
        </section>
        <section>
          <h4>What to plan toward</h4>
          <p>
            <strong>{durationRange(r)} for the core experience</strong>
          </p>
          <p>
            A planning estimate with Fineract reused. More AI allowance changes
            cost; delivery still depends on engineering and acceptance.
          </p>
        </section>
      </div>
    </div>
  );
}
