"use client";
import { useState } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import type { BranchDay } from "../../domain/branch-day";
import { LoanExposure, loanExposureTotals } from "../../domain/loans";
import { useBranchLoanRead } from "./use-loan-enquiry";
export function BranchAdvances({
  day,
  openLoan,
}: {
  day: BranchDay;
  openLoan: (customer: string, loan: number) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const anchor = day.relationships[0]?.customer.id ?? "";
  const { value, error, loading, refresh } = useBranchLoanRead(
    `/branch/advances?customerId=${encodeURIComponent(anchor)}`,
    LoanExposure,
    day.branchId,
    enabled && !day.reviewFixture && !!anchor,
  );
  const totals = value ? loanExposureTotals(value) : null;
  return (
    <section className="panel" aria-label="Registered client loan exposure">
      <h3>Advances · registered client loan enquiry</h3>
      <p>
        Read native loan principal and total outstanding for registered clients
        in servicing branch {day.branchId}. Account-owning and originating
        offices are separate. Core business-date/COB agreement and
        reconciliation remain unverified.
      </p>
      {day.reviewFixture ? (
        <p>STATIC REVIEW FIXTURE — native loan exposure is not connected.</p>
      ) : (
        <button
          type="button"
          disabled={loading || !anchor}
          onClick={() => {
            if (enabled) refresh();
            else setEnabled(true);
          }}
        >
          {enabled
            ? "Refresh branch loan exposure"
            : "Read branch loan exposure"}
        </button>
      )}
      {loading && (
        <p role="status">Reading native loan lists for registered clients…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {value && (
        <>
          <p>
            Source: Apache Fineract · INR · servicing branch {value.branchId} ·
            application IST date {value.applicationDate}. Read window{" "}
            {new Date(value.startedAt).toLocaleString("en-IN")} to{" "}
            {new Date(value.observedAt).toLocaleString("en-IN")}; separate reads
            are not an atomic snapshot.
          </p>
          <p>
            {value.coverage.loadedCustomers} of {value.coverage.totalCustomers}{" "}
            registered clients checked · {value.rows.length} loan records shown.
            Limits: {value.coverage.clientLimit} clients,{" "}
            {value.coverage.loanLimitPerClient} loans/client,{" "}
            {value.coverage.rowLimit} rows.
          </p>
          {value.errors.map((e) => (
            <p role="alert" key={`${e.customerId}-${e.message}`}>
              {e.customerId
                ? `${day.relationships.find((r) => r.customer.id === e.customerId)?.customer.display_name ?? e.customerId}: `
                : ""}
              {e.message}
            </p>
          ))}
          {totals === null ? (
            <p role="alert">
              Loan product totals withheld: registered-client, loan-page or
              financial evidence is incomplete.
            </p>
          ) : totals.length === 0 ? (
            <p>
              No Core loan records returned for the complete registered-client
              scope.
            </p>
          ) : (
            <>
              <h4>Core outstanding by loan product</h4>
              <div className="table-scroll">
                <table className="branch-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Core loan records · all returned states</th>
                      <th>Principal outstanding · INR</th>
                      <th>Total outstanding · INR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.loans}</td>
                        <td>{formatMoney(p.principalMinor / 100)}</td>
                        <td>{formatMoney(p.totalMinor / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Principal and total outstanding are separate Core fields. These
                figures include all returned loan states and do not represent
                proposed principal, available credit, settlement or a bank-wide
                advances return.
              </p>
            </>
          )}
          <h4>Underlying Core loans</h4>
          <div className="table-scroll">
            <table className="branch-table">
              <thead>
                <tr>
                  <th>Registered customer / loan</th>
                  <th>Product / state</th>
                  <th>Principal / total outstanding · INR</th>
                  <th>Enquiry</th>
                </tr>
              </thead>
              <tbody>
                {value.rows.map(({ customerId, customerName, loan }) => (
                  <tr key={loan.id}>
                    <td>
                      {customerName}
                      <small>
                        {loan.accountNo} · Core loan {loan.id}
                      </small>
                    </td>
                    <td>
                      {loan.loanProductName ??
                        `Core product ${loan.loanProductId}`}
                      <small>
                        {loan.status.value ?? `Core state ${loan.status.id}`}
                      </small>
                    </td>
                    <td>
                      {loan.summary ? (
                        <>
                          {formatMoney(loan.summary.principalOutstanding)} /{" "}
                          {formatMoney(loan.summary.totalOutstanding)}
                        </>
                      ) : (
                        "Summary not returned"
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => openLoan(customerId, loan.id)}
                      >
                        Inspect Core loan {loan.id}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
