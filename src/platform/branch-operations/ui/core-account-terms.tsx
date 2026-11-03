import type { BranchAccount } from "../domain/branch-day";
export function CoreAccountTerms({ account }: { account: BranchAccount }) {
  const truth = (value: boolean | undefined) =>
    value === undefined ? "Not returned" : value ? "Yes" : "No";
  return (
    <details>
      <summary>Core product terms and controls</summary>
      <dl>
        <dt>Interest compounding</dt>
        <dd>
          {account.interestCompoundingPeriodType?.value ?? "Not returned"}
        </dd>
        <dt>Interest posting period</dt>
        <dd>{account.interestPostingPeriodType?.value ?? "Not returned"}</dd>
        <dt>Interest calculation</dt>
        <dd>{account.interestCalculationType?.value ?? "Not returned"}</dd>
        <dt>Year basis</dt>
        <dd>
          {account.interestCalculationDaysInYearType?.value ?? "Not returned"}
        </dd>
        <dt>Transfer withdrawal fee enabled</dt>
        <dd>{truth(account.withdrawalFeeForTransfers)}</dd>
        <dt>Overdraft allowed</dt>
        <dd>{truth(account.allowOverdraft)}</dd>
        <dt>Minimum required balance enforced</dt>
        <dd>{truth(account.enforceMinRequiredBalance)}</dd>
        <dt>Withholding tax enabled</dt>
        <dd>{truth(account.withHoldTax)}</dd>
      </dl>
      <p>
        These are core account terms, not a complete tariff, tax return or
        lending schedule.
      </p>
    </details>
  );
}
