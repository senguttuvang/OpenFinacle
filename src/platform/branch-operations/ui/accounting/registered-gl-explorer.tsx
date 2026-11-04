"use client";
import { useState } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import { type BranchRelationship, coreDate } from "../../domain/branch-day";
import { RegisteredGlEvidence } from "../../domain/registered-gl";
import { CoreTableScroll } from "../core-table-scroll";
import { useBranchEvidence } from "../use-branch-evidence";
import {
  JournalComputation,
  JournalComputationNote,
} from "./journal-computation";
export function RegisteredGlExplorer({
  relationship,
  glId,
  reviewFixture,
  openCustomer,
  openLoan,
  openCommand,
}: {
  relationship: BranchRelationship;
  glId: number;
  reviewFixture?: boolean;
  openCustomer: (customer: string) => void;
  openLoan: (customer: string, loan: number) => void;
  openCommand: (command: string, customer: string) => void;
}) {
  const [offset, setOffset] = useState(0),
    [query, setQuery] = useState("");
  const { value, error, loading, refresh } = useBranchEvidence(
    `/branch/gl-journals?customerId=${encodeURIComponent(relationship.customer.id)}&id=${glId}&offset=${offset}`,
    RegisteredGlEvidence,
    relationship.customer.branch_id,
    !reviewFixture,
    "GL journal evidence is unavailable or invalid. Refresh to read again.",
  );
  const evidence =
    value?.anchorCustomerId === relationship.customer.id && value.gl.id === glId
      ? value
      : null;
  const text = query.trim().toLowerCase();
  const rows =
    evidence?.rows.filter(
      (r) =>
        !text ||
        [
          r.customerName,
          r.customerId,
          r.family,
          String(r.accountId),
          String(r.journal.id),
          r.journal.transactionId,
          String(r.journal.transactionDetails?.transactionId ?? ""),
        ].some((v) => v.toLowerCase().includes(text)),
    ) ?? [];
  return (
    <section
      className="panel"
      aria-label="Registered branch GL journal enquiry"
    >
      <span className="eyebrow">
        Core GL → verified registered relationship → native journal → original
        instruction
      </span>
      <h3>Registered branch GL journals</h3>
      <p>
        Application servicing branch {relationship.customer.branch_id} · anchor{" "}
        {relationship.customer.display_name} · chosen GL {glId}. A shared Core
        office does not grant access to other application relationships.
      </p>
      {reviewFixture ? (
        <p>
          STATIC REVIEW FIXTURE — branch-wide native journals are not connected.
        </p>
      ) : (
        <button type="button" disabled={loading} onClick={refresh}>
          Refresh registered GL journals
        </button>
      )}
      {loading && (
        <p role="status">
          Verifying registered account ownership and reading native GL journals…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {value && !evidence && (
        <p role="alert">GL or anchor scope differs. Evidence withheld.</p>
      )}
      {evidence && (
        <>
          <h4>
            {evidence.gl.glCode} · {evidence.gl.name}
          </h4>
          <p>
            Source: Apache Fineract native GL and journal records + verified
            registered account ownership. INR · application IST date{" "}
            {evidence.applicationDate}; journal dates shown per row. No journal
            date filter is applied. Native client office {evidence.office.id}{" "}
            {evidence.office.name ?? ""} supplies the originating-office filter;
            this does not certify account-owning office or application-branch
            equivalence.
          </p>
          <p>
            Read window {new Date(evidence.startedAt).toLocaleString("en-IN")}{" "}
            to {new Date(evidence.observedAt).toLocaleString("en-IN")}; registry
            account observation{" "}
            {new Date(evidence.registryStartedAt).toLocaleString("en-IN")}.
            Separate reads are not an atomic ledger snapshot. Core
            business-date/COB agreement is unverified.
          </p>
          {evidence.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          <p>
            {evidence.coverage.loadedCustomers} of{" "}
            {evidence.coverage.registeredCustomers} registered relationships
            loaded · {evidence.coverage.eligibleAccounts} unambiguous verified
            savings accounts.{" "}
            {evidence.coverage.registryLimited
              ? "Registered ownership coverage limited."
              : "Loaded registered account ownership checked."}{" "}
            Loan ownership reads are limited to{" "}
            {evidence.coverage.loanOwnershipLimit} unique loans/page;{" "}
            {evidence.coverage.loanOwnershipFailures} unavailable reads.
          </p>
          <p>
            {evidence.rows.length} verified owned rows from{" "}
            {evidence.coverage.sourceRows} provider rows on this page ·{" "}
            {evidence.coverage.excludedRows}{" "}
            unregistered/manual/unidentified/unverifiable rows excluded. These
            are scoped records, not a full Core office ledger. Provider group
            labels are not parsed as transaction IDs.
          </p>
          <div className="branch-day-actions branch-day-filters">
            <label>
              Find loaded GL journal
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Customer, account, journal or native transaction"
              />
            </label>
            <button type="button" onClick={() => setQuery("")}>
              Clear GL journal search
            </button>
          </div>
          <p>
            {rows.length} of {evidence.rows.length} verified rows match the page
            search. Filtering changes no source coverage or financial amount.
          </p>
          <nav
            className="branch-day-actions"
            aria-label="Registered GL provider pages"
          >
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 200))}
            >
              Previous registered GL page
            </button>
            <span>
              Provider offset {offset} · limit200 ·{" "}
              {evidence.coverage.totalProviderRows} reported rows
            </span>
            <button
              type="button"
              disabled={loading || !evidence.coverage.hasMore}
              onClick={() => setOffset(offset + 200)}
            >
              Next registered GL page
            </button>
          </nav>
          <CoreTableScroll label="Registered relationship GL journal table">
            <table className="branch-table">
              <thead>
                <tr>
                  <th>Journal / provider group</th>
                  <th>Date / originating office</th>
                  <th>Registered relationship / native entity</th>
                  <th>Entry / amount · INR</th>
                  <th>Exact native transaction</th>
                  <th>Saved original instruction</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.journal.id}>
                    <td>
                      {r.journal.id}
                      <small>{r.journal.transactionId}</small>
                    </td>
                    <td>
                      {coreDate(r.journal.transactionDate)}
                      <small>
                        {r.journal.officeName ?? r.journal.officeId}
                      </small>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          r.family === "Loan"
                            ? openLoan(r.customerId, r.accountId)
                            : openCustomer(r.customerId)
                        }
                      >
                        {r.customerName} · {r.family} {r.accountId}
                      </button>
                    </td>
                    <td>
                      {r.journal.entryType.value} ·{" "}
                      {formatMoney(r.journal.amount)}
                      <JournalComputation
                        computed={r.journal.runningBalanceComputed}
                      />
                      <small>
                        Core reversal flag:{" "}
                        {r.journal.reversed === undefined
                          ? "Not returned"
                          : r.journal.reversed
                            ? "Yes"
                            : "No"}
                      </small>
                    </td>
                    <td>
                      {r.journal.transactionDetails?.transactionId ??
                        "Not returned"}
                    </td>
                    <td>
                      {r.originalCommandId ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (r.originalCommandId)
                              openCommand(r.originalCommandId, r.customerId);
                          }}
                        >
                          Original cash instruction {r.originalCommandId}
                        </button>
                      ) : r.family === "Loan" ? (
                        "Open loan enquiry for saved posting provenance"
                      ) : (
                        "No unique verified saved cash instruction link"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CoreTableScroll>
          <JournalComputationNote />
          {!rows.length && (
            <p>
              No verified owned journals match this provider page/search. This
              is not a zero GL balance or absence-of-work certificate.
            </p>
          )}
        </>
      )}
      <h4>Cash position and reconciliation</h4>
      <p>
        Unavailable as current cash-position proof. No balance is calculated
        from these entries. Core's uncomputed stored zero and currency-less
        report totals are not displayed as balances. Physical cash counts,
        external settlement, currency-aware current book positions and formal
        close remain unverified.
      </p>
    </section>
  );
}
