"use client";
import { Schema } from "effect";
import { useMemo, useState } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import { type BranchRelationship, coreDate } from "../../domain/branch-day";
import {
  SavingsStatement,
  StatementQuery,
} from "../../domain/savings-statement";
import { CoreTableScroll } from "../core-table-scroll";
import { useBranchEvidence } from "../use-branch-evidence";
import { useStatementExport } from "./use-statement-export";

export function BranchSavingsStatement({
  relationship: r,
  reviewFixture,
}: {
  relationship: BranchRelationship;
  reviewFixture?: boolean;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [query, setQuery] = useState<StatementQuery | null>(null);
  const exported = useStatementExport();
  const schema = useMemo(
    () =>
      SavingsStatement.pipe(
        Schema.filter(
          (v) =>
            v.customerId === r.customer.id &&
            v.account.id === r.customer.account_id &&
            v.account.clientId === r.customer.client_id &&
            v.account.accountNo === r.customer.account_no &&
            v.query.mode === "page" &&
            v.query.from === query?.from &&
            v.query.to === query?.to &&
            v.query.page === query?.page,
        ),
      ),
    [
      r.customer.id,
      r.customer.account_id,
      r.customer.client_id,
      r.customer.account_no,
      query?.from,
      query?.to,
      query?.page,
    ],
  );
  const parameters = new URLSearchParams({
    customerId: r.customer.id,
    page: String(query?.page ?? 0),
    mode: "page",
  });
  if (query?.from) parameters.set("from", query.from);
  if (query?.to) parameters.set("to", query.to);
  const evidence = useBranchEvidence(
    `/branch/savings-statement?${parameters}`,
    schema,
    r.customer.branch_id,
    query !== null && !reviewFixture,
    "Native savings statement evidence is unavailable, invalid or outside the selected scope. Refresh before exporting.",
  );
  const value = query ? evidence.value : null;
  const draft = {
    from: from || null,
    to: to || null,
    page: 0,
    mode: "page" as const,
  };
  const valid = Schema.is(StatementQuery)(draft);
  const reset = () => {
    setQuery(null);
    exported.invalidate();
  };
  const read = (page: number) => {
    exported.invalidate();
    setQuery({ ...draft, page });
    evidence.refresh();
  };
  return (
    <section
      className="branch-day-item"
      aria-label="Owned savings statement enquiry"
    >
      <h4>Native savings enquiry and CSV</h4>
      <p>
        For {r.customer.display_name} · registered account{" "}
        {r.customer.account_no}. This enquiry and export keep the
        header-selected customer unchanged.
      </p>
      {reviewFixture ? (
        <p>
          Native statements and exports are unavailable in the static review
          fixture.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) read(0);
          }}
        >
          <div className="branch-day-actions">
            <label>
              Native value date from
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  reset();
                  setFrom(e.target.value);
                }}
              />
            </label>
            <label>
              Native value date to
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  reset();
                  setTo(e.target.value);
                }}
              />
            </label>
          </div>
          <p>
            Dates are inclusive native transaction value dates. Blank leaves
            that boundary unfiltered. They are separate from booking dates and
            the application IST date.
          </p>
          {!valid && (
            <p role="alert">
              Use valid native dates, with From no later than To.
            </p>
          )}
          <button type="submit" disabled={!valid || evidence.loading}>
            Read savings transactions
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setFrom("");
              setTo("");
            }}
          >
            Clear savings enquiry
          </button>
        </form>
      )}
      {evidence.loading && query && (
        <p role="status">Reading selected native savings transactions…</p>
      )}
      {evidence.error && query && <p role="alert">{evidence.error}</p>}
      {value && (
        <>
          <p>
            Source: {value.source} · {value.account.currency.code} · servicing
            branch {value.branchId} · native account {value.account.id} / client{" "}
            {value.account.clientId} · native client office{" "}
            {value.account.clientOfficeId ?? "Not returned"}.
          </p>
          <p>
            Application IST date {value.applicationDate}; Core business-date
            agreement is unverified. Read window{" "}
            {new Date(value.startedAt).toISOString()} to{" "}
            {new Date(value.observedAt).toISOString()}. Native paged reads are
            not an atomic snapshot.
          </p>
          <p>
            Native page {value.query.page + 1} · {value.rows.length} returned
            rows of {value.total} matching transactions · page size{" "}
            {value.pageSize}. Missing running balances, entry types and reversal
            states remain unavailable. No opening, closing or cash balance is
            reconstructed; these rows do not prove settlement or close.
          </p>
          <div className="branch-day-actions">
            <button
              type="button"
              disabled={evidence.loading || value.query.page === 0}
              onClick={() => read(value.query.page - 1)}
            >
              Previous savings page
            </button>
            <button
              type="button"
              disabled={
                evidence.loading || (value.query.page + 1) * 200 >= value.total
              }
              onClick={() => read(value.query.page + 1)}
            >
              Next savings page
            </button>
            {value.query.page > 0 && (
              <button type="button" onClick={() => read(0)}>
                First savings page
              </button>
            )}
          </div>
          <CoreTableScroll label="Owned savings transaction table">
            <table className="branch-table">
              <thead>
                <tr>
                  <th>Native reference</th>
                  <th>Native value date</th>
                  <th>Type</th>
                  <th>Native entry type</th>
                  <th>Native amount · INR</th>
                  <th>Native running balance · INR</th>
                  <th>Reversal state</th>
                </tr>
              </thead>
              <tbody>
                {value.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{coreDate(row.date)}</td>
                    <td>{row.transactionType.value}</td>
                    <td>{row.entryType ?? "Unavailable"}</td>
                    <td>{formatMoney(row.amount)}</td>
                    <td>
                      {row.runningBalance === null ||
                      row.runningBalance === undefined
                        ? "Unavailable"
                        : formatMoney(row.runningBalance)}
                    </td>
                    <td>
                      {row.reversed === null || row.reversed === undefined
                        ? "Unavailable"
                        : row.reversed
                          ? "Reversed"
                          : "Not reversed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CoreTableScroll>
          {!value.rows.length && (
            <p>
              No native transactions returned on this page; matching native
              total {value.total}. Empty results do not certify an inactive
              account or reconciled branch.
            </p>
          )}
          <button
            type="button"
            disabled={exported.exporting || value.total > 5000}
            onClick={() => void exported.download(value)}
          >
            Export all matching savings transactions as CSV
          </button>
          {value.total > 5000 && (
            <p role="alert">
              More than5000 native transactions match. Narrow the native dates
              before exporting; partial CSV is withheld.
            </p>
          )}
          <p>
            Export independently rereads every matching native page, up to5000
            rows. The CSV includes a provenance/enquiry row even for an explicit
            empty result. Potential spreadsheet formulas in text cells are
            prefixed with an apostrophe; import account numbers as text to
            preserve leading zeros.
          </p>
        </>
      )}
      {exported.exporting && (
        <p role="status">Reading all matching native pages for CSV…</p>
      )}
      {exported.notice && <p role="status">{exported.notice}</p>}
    </section>
  );
}
