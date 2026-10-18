import { type CoreInvestment, durationRange, inr, usd } from "./model";

export function TeamBudget({ result }: { result: CoreInvestment }) {
  return (
    <div className="ci-budget">
      <strong>{inr(result.payrollInr)}</strong>
      <span>people</span>
      <strong>{usd(result.toolUsd)}</strong>
      <span>AI tools · {result.billingMonths} billed months</span>
    </div>
  );
}
export function FinacleFacts() {
  return (
    <dl className="ci-facts">
      <div>
        <dt>Core investment</dt>
        <dd>~US$30M</dd>
      </div>
      <div>
        <dt>Equivalent team</dt>
        <dd>~180 people</dd>
      </div>
      <div>
        <dt>Engineering effort</dt>
        <dd>~120,000 days</dd>
      </div>
      <div>
        <dt>Development window</dt>
        <dd>3 years</dd>
      </div>
    </dl>
  );
}
export function Outlook({
  result,
  weeks,
}: {
  result: CoreInvestment;
  weeks: number;
}) {
  return (
    <div className="ci-outlook">
      <strong>{durationRange(result)}</strong>
      <p>
        Planning range for the defined core experience.
        {weeks < (result.lowWeeks ?? 0)
          ? " This window funds an initial slice."
          : weeks >= (result.highWeeks ?? Infinity)
            ? " This window covers both effort bounds."
            : " This window reaches the lower estimate; retain contingency."}
      </p>
    </div>
  );
}
export function ScopeLine() {
  return (
    <p className="ci-scope-line">
      <strong>Core banking only</strong> Accounts, deposits, internal payments,
      lending, ledger, maker-checker and operations. Reuse Apache Fineract.
      Excludes wealth, cards networks, external rails and bank rollout.
    </p>
  );
}
