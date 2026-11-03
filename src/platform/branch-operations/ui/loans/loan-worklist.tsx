"use client";
import { useState } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import {
  filterLoanWork,
  type LoanWorkFilters,
  loanWorkOptions,
} from "../../domain/loan-work";
import type { LoanExposure } from "../../domain/loans";
import { LoanTableScroll } from "./loan-table-scroll";

export function LoanWorklist({
  exposure,
  openLoan,
  daily,
}: {
  exposure: LoanExposure;
  openLoan: (customer: string, loan: number) => void;
  daily: boolean;
}) {
  const defaults: LoanWorkFilters = {
    query: "",
    product: "",
    state: "",
    evidence: daily ? "overdue" : "all",
  };
  const [filters, setFilters] = useState(defaults);
  const rows = filterLoanWork(exposure.rows, filters);
  const options = loanWorkOptions(exposure.rows);
  const change = <K extends keyof LoanWorkFilters>(
    key: K,
    value: LoanWorkFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <>
      <h4>{daily ? "Loan exception enquiry" : "Underlying Core loans"}</h4>
      <p>
        Loaded evidence:{" "}
        {
          exposure.rows.filter(
            (r) => !!r.loan.summary && r.loan.summary.totalOverdue > 0,
          ).length
        }{" "}
        loans report native overdue amounts;{" "}
        {exposure.rows.filter((r) => !r.loan.summary).length} have no summary.
        Core overdue is a returned field, not a fresh ageing calculation, NPA
        classification or proof of agreement with the application date. No
        collection or financial action is available here.
      </p>
      <div className="branch-day-actions branch-day-filters">
        <label>
          Find loan work
          <input
            type="search"
            value={filters.query}
            onChange={(e) => change("query", e.target.value)}
            placeholder="Customer, account, Core loan/client reference"
          />
        </label>
        <label>
          Loan product filter
          <select
            value={filters.product}
            onChange={(e) => change("product", e.target.value)}
          >
            <option value="">All loaded products</option>
            {options.products.map(([id, name]) => (
              <option key={id} value={id}>
                {name} · Core product {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Core loan state filter
          <select
            value={filters.state}
            onChange={(e) => change("state", e.target.value)}
          >
            <option value="">All returned states</option>
            {options.states.map(([id, name]) => (
              <option key={id} value={id}>
                {name} · {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loan evidence filter
          <select
            value={filters.evidence}
            onChange={(e) => {
              const next = e.target.value;
              if (
                next === "all" ||
                next === "overdue" ||
                next === "missing" ||
                next === "zero"
              )
                change("evidence", next);
            }}
          >
            <option value="all">All loaded evidence</option>
            <option value="overdue">Native overdue greater than zero</option>
            <option value="missing">Summary unavailable</option>
            <option value="zero">Native overdue explicitly zero</option>
          </select>
        </label>
        <button type="button" onClick={() => setFilters(defaults)}>
          Reset loan filters
        </button>
      </div>
      <p>
        {rows.length} of {exposure.rows.length} loaded Core loans match these
        filters. Filters do not change branch coverage or whole-book product
        totals. An empty filtered worklist does not prove absence of branch
        arrears, collections, settlement work or close blockers.
      </p>
      <LoanTableScroll label="Registered client Core loan table">
        <table className="branch-table">
          <thead>
            <tr>
              <th>Registered customer / loan</th>
              <th>Product / state</th>
              <th>Principal / total outstanding · INR</th>
              <th>Native overdue · INR</th>
              <th>Enquiry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ customerId, customerName, loan }) => (
              <tr key={loan.id}>
                <td>
                  {customerName}
                  <small>
                    {loan.accountNo} · Core loan {loan.id}
                  </small>
                </td>
                <td>
                  {loan.loanProductName ?? `Core product ${loan.loanProductId}`}
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
                  {loan.summary
                    ? formatMoney(loan.summary.totalOverdue)
                    : "Unavailable"}
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
      </LoanTableScroll>
      {!rows.length && (
        <p>
          No loaded loans match these filters. Missing evidence remains unknown.
        </p>
      )}
    </>
  );
}
