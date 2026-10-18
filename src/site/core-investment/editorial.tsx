import { PlanControls } from "./controls";
import {
  type CorePlan,
  coreInvestment,
  formatNumber,
  formatWeeks,
} from "./model";
import { FinacleFacts, Outlook, TeamBudget } from "./shared";

export function Editorial({
  plan,
  onChange,
}: {
  plan: CorePlan;
  onChange: (plan: CorePlan) => void;
}) {
  const result = coreInvestment(plan);
  return (
    <div className="ci-editorial">
      <div className="ci-editorial-intro">
        <h3>
          A banking product.
          <br />A different way to build.
        </h3>
        <p>
          Finacle’s core investment, inferred from its public record. Your
          AI-first team, sized for the next chapter.
        </p>
        <PlanControls plan={plan} onChange={onChange} />
      </div>
      <div className="ci-editorial-finacle">
        <h4>Finacle core</h4>
        <span className="ci-status">Historical inference</span>
        <FinacleFacts />
        <p>
          Core allocation of the 2008 release investment. See the shared
          evidence below.
        </p>
      </div>
      <div className="ci-editorial-team">
        <h4>Your AI-first team</h4>
        <span className="ci-status">
          {plan.people} people · {formatWeeks(plan.weeks)} weeks
        </span>
        <TeamBudget result={result} />
        <p>
          {formatNumber(result.personDays)} full-time person-days
          <br />
          {plan.codex} Codex + {plan.claude} Claude accounts
        </p>
        <Outlook result={result} weeks={plan.weeks} />
      </div>
    </div>
  );
}
