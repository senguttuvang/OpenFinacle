import { ProductTable } from "../../../app/product-table";
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

export function Ledger({
  plan,
  onChange,
}: {
  plan: CorePlan;
  onChange: (plan: CorePlan) => void;
}) {
  const r = coreInvestment(plan);
  return (
    <div className="ci-ledger">
      <div className="ci-ledger-title">
        <h3>The investment ledger.</h3>
        <p>One core-product brief. The historical build and the next build.</p>
      </div>
      <div className="ci-ledger-body">
        <div className="ci-table-wrap">
          <ProductTable label="Investment ledger comparison">
            <table>
              <thead>
                <tr>
                  <th scope="col">The commitment</th>
                  <th scope="col">
                    Finacle core <small>historical inference</small>
                  </th>
                  <th scope="col">
                    AI-first team <small>your plan</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">People</th>
                  <td>~180</td>
                  <td>{plan.people}</td>
                </tr>
                <tr>
                  <th scope="row">Time</th>
                  <td>3 years</td>
                  <td>{formatWeeks(plan.weeks)} weeks</td>
                </tr>
                <tr>
                  <th scope="row">Human effort</th>
                  <td>~120,000 days</td>
                  <td>{formatNumber(r.personDays)} days</td>
                </tr>
                <tr>
                  <th scope="row">Investment</th>
                  <td>
                    ~US$30M<small>nominal historical USD</small>
                  </td>
                  <td>
                    {inr(r.payrollInr)}
                    <small>people · INR</small>
                    {usd(r.toolUsd)}
                    <small>tools · USD</small>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Foundation</th>
                  <td>Product engineering</td>
                  <td>Existing Fineract core</td>
                </tr>
              </tbody>
            </table>
          </ProductTable>
          <Outlook result={r} weeks={plan.weeks} />
        </div>
        <PlanControls plan={plan} onChange={onChange} />
      </div>
    </div>
  );
}
