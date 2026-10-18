import { formatMoney } from "../../banking-workspace/domain/banking";
import {
  loanStatementCoverage,
  loanTransactionLabel,
} from "../domain/origination/loan-statements";
import type { LoanDetail } from "../domain/origination/loan-workflow";
import { loanDate } from "./loan-terms";

export function LoanPostedStatement({ detail }: { detail: LoanDetail }) {
  const core = detail.core;
  if (core?.snapshot.status !== "active") return null;
  const statement = core.snapshot.statement;
  return (
    <section aria-label="Saved loan statement" className="loan-statement">
      <div className="panel-heading">
        <h4>Core transactions & statement</h4>
        {statement && (
          <a
            className="loan-statement-download"
            href={`/api/loans/statement?id=${encodeURIComponent(detail.loan.id)}`}
          >
            Download saved CSV
          </a>
        )}
      </div>
      {!statement ? (
        <p>
          No statement has been loaded for this observation. Refresh Core
          explicitly to read its transactions. The repayment schedule shows
          planned amounts, not posted repayments.
        </p>
      ) : (
        <>
          <p>
            {core.stale ? "Stale saved statement" : "Saved Core statement"} ·{" "}
            {new Date(core.synced_at).toLocaleString("en-IN")}. Refresh
            explicitly for a current observation.
          </p>
          <dl className="detail-grid deposit-facts">
            {(
              [
                ["Principal paid", statement.principal_paid_minor],
                ["Interest paid", statement.interest_paid_minor],
                ["Total repaid", statement.repayment_minor],
                [
                  "Principal outstanding",
                  statement.principal_outstanding_minor,
                ],
                ["Interest outstanding", statement.interest_outstanding_minor],
                ["Total outstanding", statement.outstanding_minor],
              ] as const
            ).map(([label, amount]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatMoney(amount / 100)}</dd>
              </div>
            ))}
          </dl>
          <p>{loanStatementCoverage}</p>
          <p>
            Amounts and allocation components come from Core. A disbursement is
            not a repayment; these rows do not calculate your balance.
          </p>
          <section
            className="loan-schedule loan-transactions table-scroll"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: The complete transaction table needs keyboard horizontal scrolling at narrow widths and large text.
            tabIndex={0}
            aria-label="Loan transactions, scroll horizontally if needed"
          >
            <table>
              <caption>Saved Core loan transactions</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Date</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Principal allocation</th>
                  <th scope="col">Interest allocation</th>
                  <th scope="col">Other allocations</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {statement.transactions.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">#{row.id}</th>
                    <td>{loanDate(row.date)}</td>
                    <td>{loanTransactionLabel(row.type_id)}</td>
                    <td>{formatMoney(row.amount_minor / 100)}</td>
                    <td>{formatMoney(row.principal_minor / 100)}</td>
                    <td>{formatMoney(row.interest_minor / 100)}</td>
                    <td>
                      <details>
                        <summary>Allocation details</summary>
                        <dl>
                          <dt>Fees</dt>
                          <dd>{formatMoney(row.fees_minor / 100)}</dd>
                          <dt>Penalties</dt>
                          <dd>{formatMoney(row.penalties_minor / 100)}</dd>
                          <dt>Overpayment</dt>
                          <dd>{formatMoney(row.overpayment_minor / 100)}</dd>
                          <dt>Unrecognized income</dt>
                          <dd>
                            {formatMoney(row.unrecognized_income_minor / 100)}
                          </dd>
                        </dl>
                      </details>
                    </td>
                    <td>
                      {row.manually_reversed
                        ? `Manually reversed${row.reversed_on_date ? ` · ${loanDate(row.reversed_on_date)}` : " · date not recorded"}`
                        : "Recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </section>
  );
}
