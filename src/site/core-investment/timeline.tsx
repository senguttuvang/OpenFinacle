import { PlanControls } from "./controls";
import {
  type CorePlan,
  coreInvestment,
  durationRange,
  formatWeeks,
  inr,
  usd,
} from "./model";

export function Timeline({
  plan,
  onChange,
}: {
  plan: CorePlan;
  onChange: (plan: CorePlan) => void;
}) {
  const r = coreInvestment(plan);
  return (
    <div className="ci-timeline">
      <header>
        <h3>
          From a working prototype
          <br />
          to a core experience.
        </h3>
        <p>
          What the next {formatWeeks(plan.weeks)} weeks could fund, with{" "}
          {plan.people} people working full-time.
        </p>
      </header>
      <div className="ci-timeline-body">
        <div>
          <div className="ci-historical-line">
            <span>Finacle core · historical inference</span>
            <strong>~180 people × 3 years</strong>
            <p>~US$30M core allocation · ~120,000 person-days</p>
          </div>
          <ol className="ci-milestones">
            <li>
              <span>Starting point</span>
              <h4>A working foundation</h4>
              <p>
                Fineract-backed accounts and postings, selected lending,
                deposits and customer/branch journeys already exist.
              </p>
            </li>
            <li>
              <span>Your next {formatWeeks(plan.weeks)} weeks</span>
              <h4>
                {inr(r.payrollInr)} <small>people</small> + {usd(r.toolUsd)}{" "}
                <small>tools</small>
              </h4>
              <p>
                Complete and connect the selected core journeys. Budget for
                integration, tests and review.
              </p>
            </li>
            <li>
              <span>Planning envelope · {durationRange(r)}</span>
              <h4>A coherent core experience</h4>
              <p>
                Consistent servicing, reconciliation, permissions and
                operational handling. Bank deployment needs a separate program.
              </p>
            </li>
          </ol>
        </div>
        <PlanControls plan={plan} onChange={onChange} />
      </div>
    </div>
  );
}
