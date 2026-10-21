import { PlanControls } from "./controls";
import {
  type CorePlan,
  coreInvestment,
  formatNumber,
  formatWeeks,
  inr,
  usd,
} from "./model";
import { Outlook } from "./shared";

export function Workbench({
  plan,
  onChange,
}: {
  plan: CorePlan;
  onChange: (plan: CorePlan) => void;
}) {
  const r = coreInvestment(plan);
  return (
    <div className="ci-workbench">
      <aside>
        <h3>Build your core.</h3>
        <p>
          Start with the team.
          <br />
          See the commitment.
        </p>
        <PlanControls plan={plan} onChange={onChange} />
      </aside>
      <div className="ci-workbench-result">
        <div className="ci-reference-strip">
          <strong>Finacle core · inferred</strong>
          <span>~US$30M</span>
          <span>~180 people</span>
          <span>3 years</span>
        </div>
        <div className="ci-workbench-total">
          <p>Your {formatWeeks(plan.weeks)}-week commitment</p>
          <strong>{inr(r.payrollInr)}</strong>
          <span>in people investment</span>
          <b>+ {usd(r.toolUsd)} AI tools</b>
        </div>
        <div className="ci-workbench-stats">
          <div>
            <strong>{formatNumber(r.personDays)}</strong>
            <span>full-time person-days</span>
          </div>
          <div>
            <strong>{usd(r.monthlyTools)}</strong>
            <span>monthly tools allowance</span>
          </div>
          <div>
            <strong>{plan.codex + plan.claude}</strong>
            <span>paid AI accounts</span>
          </div>
        </div>
        <Outlook result={r} weeks={plan.weeks} />
      </div>
    </div>
  );
}
