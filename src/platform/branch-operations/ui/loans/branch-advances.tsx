"use client";
import { useState } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import type { BranchDay } from "../../domain/branch-day";
import { LoanExposure, loanExposureTotals } from "../../domain/loans";
import { CoreTableScroll } from "../core-table-scroll";
import { useBranchEvidence } from "../use-branch-evidence";
import { LoanWorklist } from "./loan-worklist";
export function BranchAdvances({
  day,
  openLoan,
  daily = false,
}: {
  day: BranchDay;
  daily?: boolean;
  openLoan: (customer: string, loan: number) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const anchor = day.relationships[0]?.customer.id ?? "";
  const { value, error, loading, refresh } = useBranchEvidence(
    `/branch/advances?customerId=${encodeURIComponent(anchor)}`,
    LoanExposure,
    day.branchId,
    enabled && !day.reviewFixture && !!anchor,
  );
  const totals = value ? loanExposureTotals(value) : null;
  return (
    <section
      className="panel"
      aria-label={
        daily
          ? "Daily loan exception worklist"
          : "Registered client loan exposure"
      }
    >
      <h3>
        {daily
          ? "Daily loan worklist · native overdue evidence"
          : "Advances · registered client loan enquiry"}
      </h3>
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
            ? daily
              ? "Refresh daily loan worklist"
              : "Refresh branch loan exposure"
            : daily
              ? "Read daily loan worklist"
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
          {daily ? null : totals === null ? (
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
              <CoreTableScroll label="Loan product outstanding table">
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
              </CoreTableScroll>
              <p>
                Principal and total outstanding are separate Core fields. These
                figures include all returned loan states and do not represent
                proposed principal, available credit, settlement or a bank-wide
                advances return.
              </p>
            </>
          )}
          {daily && totals === null && (
            <p role="alert">
              Loan worklist coverage is incomplete. Missing or invalid evidence
              prevents any branch-wide absence-of-arrears conclusion.
            </p>
          )}
          <LoanWorklist exposure={value} openLoan={openLoan} daily={daily} />
        </>
      )}
    </section>
  );
}
