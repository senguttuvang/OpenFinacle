"use client";
import { Fragment } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import { coreDate } from "../../domain/branch-day";
import { LoanEnquiry } from "../../domain/loans";
import { CoreTableScroll } from "../core-table-scroll";
import { useBranchEvidence } from "../use-branch-evidence";

const money = (value: number | undefined) =>
  value === undefined ? "Not returned" : formatMoney(value);
export function BranchLoanDetail({
  customerId,
  branchId,
  loanId,
  reviewFixture,
  accounting,
}: {
  customerId: string;
  branchId: string;
  loanId: number;
  reviewFixture?: boolean;
  accounting: () => void;
}) {
  const { value, error, loading, refresh } = useBranchEvidence(
    `/branch/loan?customerId=${encodeURIComponent(customerId)}&id=${loanId}`,
    LoanEnquiry,
    branchId,
    loanId > 0 && !reviewFixture,
  );
  if (!loanId) return null;
  const owned =
    value?.customerId === customerId && value.loan.id === loanId ? value : null;
  const loan = owned?.loan;
  const periods = loan?.repaymentSchedule?.periods;
  return (
    <section className="branch-day-item" aria-label="Owned Core loan enquiry">
      <h4>Core loan {loanId} · read-only account enquiry</h4>
      <p>
        Registered client scope · servicing branch {branchId} · INR. Loan
        enquiries grant no repayment, funding or servicing authority. The
        controlled instructions elsewhere on this account page target the
        registered savings account.
      </p>
      {reviewFixture ? (
        <p>STATIC REVIEW FIXTURE — loan evidence is not connected.</p>
      ) : (
        <button type="button" disabled={loading} onClick={refresh}>
          Refresh Core loan enquiry
        </button>
      )}
      {loading && <p role="status">Reading owned Core loan detail…</p>}
      {error && <p role="alert">{error}</p>}
      {value && !owned && (
        <p role="alert">
          Loan identity does not match this enquiry. Evidence withheld.
        </p>
      )}
      {loan && owned && (
        <>
          <button type="button" onClick={accounting}>
            Trace loan product → journals → GL
          </button>
          <p>
            Source: Apache Fineract · loan {loan.accountNo} · observed{" "}
            {new Date(owned.observedAt).toLocaleString("en-IN")}. Core
            business-date/COB agreement is unverified.
          </p>
          <dl className="account-facts">
            <dt>Product / Core state</dt>
            <dd>
              {loan.loanProductName ?? `Core product ${loan.loanProductId}`} /{" "}
              {loan.status.value ?? loan.status.id}
            </dd>
            <dt>Core principal term</dt>
            <dd>{money(loan.principal)}</dd>
            <dt>Annual interest rate · Core value</dt>
            <dd>
              {loan.annualInterestRate === undefined
                ? "Not returned"
                : `${loan.annualInterestRate}%`}
            </dd>
            {[
              ["Principal outstanding", loan.summary?.principalOutstanding],
              ["Interest outstanding", loan.summary?.interestOutstanding],
              ["Fees outstanding", loan.summary?.feeChargesOutstanding],
              [
                "Penalties outstanding",
                loan.summary?.penaltyChargesOutstanding,
              ],
              ["Total outstanding", loan.summary?.totalOutstanding],
              ["Total overdue", loan.summary?.totalOverdue],
            ].map(([name, amount]) => (
              <Fragment key={name}>
                <dt>{name}</dt>
                <dd>
                  {money(typeof amount === "number" ? amount : undefined)}
                </dd>
              </Fragment>
            ))}
          </dl>
          <h5>Core repayment schedule</h5>
          <p>
            Core-calculated schedule values, including schedule funding amounts.
            These do not verify actual funding or repayment. Recorded
            transactions and the Core summary are separate evidence. Settlement,
            collections and customer notification remain unverified.
          </p>
          {!periods ? (
            <p>Repayment schedule not returned.</p>
          ) : periods.length === 0 ? (
            <p>No repayment period rows returned by Core.</p>
          ) : (
            <CoreTableScroll label="Core loan repayment schedule table">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Period / due date</th>
                    <th>Principal / interest due · INR</th>
                    <th>Fees / penalties due · INR</th>
                    <th>Total due / paid / outstanding · INR</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.sourceLine}>
                      <td>
                        {p.period ??
                          (p.principalDisbursed !== undefined
                            ? "Funding line"
                            : "Period not returned")}
                        <small>{coreDate(p.dueDate)}</small>
                        {p.principalDisbursed !== undefined && (
                          <small>
                            Schedule funding amount:{" "}
                            {money(p.principalDisbursed)}
                          </small>
                        )}
                      </td>
                      <td>
                        {money(p.principalDue)} / {money(p.interestDue)}
                      </td>
                      <td>
                        {money(p.feeChargesDue)} / {money(p.penaltyChargesDue)}
                      </td>
                      <td>
                        {money(p.totalDueForPeriod)} /{" "}
                        {money(p.totalPaidForPeriod)} /{" "}
                        {money(p.totalOutstandingForPeriod)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CoreTableScroll>
          )}
          <h5>Core recorded loan transactions</h5>
          {!loan.transactions ? (
            <p>Transactions not returned.</p>
          ) : loan.transactions.length === 0 ? (
            <p>No transaction rows returned by Core.</p>
          ) : (
            <CoreTableScroll label="Core recorded loan transactions table">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Core reference / type</th>
                    <th>Date</th>
                    <th>Amount · INR</th>
                    <th>Manual reversal flag</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.id}
                        <small>
                          {t.type.value ?? `Core type ${t.type.id}`}
                        </small>
                      </td>
                      <td>{coreDate(t.date)}</td>
                      <td>{money(t.amount)}</td>
                      <td>
                        {t.manuallyReversed === undefined
                          ? "Not returned"
                          : t.manuallyReversed
                            ? "Yes"
                            : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CoreTableScroll>
          )}
        </>
      )}
    </section>
  );
}
