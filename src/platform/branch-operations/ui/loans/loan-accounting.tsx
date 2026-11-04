"use client";
import { useState } from "react";
import { formatMoney } from "../../../banking-workspace/domain/banking";
import { type BranchRelationship, coreDate } from "../../domain/branch-day";
import {
  LoanAccountingEvidence,
  matchedLoanReceipt,
  matchedLoanTransaction,
} from "../../domain/loan-accounting";
import {
  JournalComputation,
  JournalComputationNote,
} from "../accounting/journal-computation";
import { CoreTableScroll } from "../core-table-scroll";
import { useBranchEvidence } from "../use-branch-evidence";
export function LoanAccountingExplorer({
  relationship,
  loanId,
  reviewFixture,
}: {
  relationship: BranchRelationship;
  loanId: number;
  reviewFixture?: boolean;
}) {
  const [offset, setOffset] = useState(0),
    [gl, setGl] = useState(""),
    [transactionId, setTransactionId] = useState(0);
  const { value, error, loading, refresh } = useBranchEvidence(
    `/branch/loan-accounting?customerId=${encodeURIComponent(relationship.customer.id)}&id=${loanId}&offset=${offset}`,
    LoanAccountingEvidence,
    relationship.customer.branch_id,
    !reviewFixture,
  );
  const evidence =
    value?.customerId === relationship.customer.id && value.loanId === loanId
      ? value
      : null;
  const rows =
    evidence?.journals?.pageItems.filter(
      (row) => !gl || String(row.glAccountId) === gl,
    ) ?? [];
  const transaction = evidence?.loan.transactions?.find(
    (t) => t.id === transactionId,
  );
  const receipt =
    evidence && transaction
      ? matchedLoanReceipt(evidence, transaction.id)
      : null;
  return (
    <section className="panel" aria-label="Owned loan accounting explorer">
      <span className="eyebrow">
        Owned loan → product / GL → journal → Core transaction → saved posting
        receipt
      </span>
      <h3>Loan accounting explorer</h3>
      <p>
        {relationship.customer.display_name} · Core loan {loanId} · servicing
        branch {relationship.customer.branch_id} · INR. Journal dates and
        originating offices are shown per row; these historical entries are
        separate from the application date and unverified Core business-date/COB
        agreement.
      </p>
      {reviewFixture ? (
        <p>
          STATIC REVIEW FIXTURE — loan accounting sources are not connected.
        </p>
      ) : (
        <button type="button" disabled={loading} onClick={refresh}>
          Refresh loan accounting evidence
        </button>
      )}
      {loading && (
        <p role="status">
          Reading owned loan accounting and saved posting provenance…
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {value && !evidence && (
        <p role="alert">
          Accounting scope differs from the chosen loan. Evidence withheld.
        </p>
      )}
      {evidence && (
        <>
          <p>
            Source: Apache Fineract loan/product/chart/journals + saved
            application receipts · observed{" "}
            {new Date(evidence.observedAt).toLocaleString("en-IN")}. Separate
            reads are not an atomic snapshot.
          </p>
          {evidence.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          {evidence.posting?.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          <h4>Core loan product GL mapping</h4>
          {evidence.product ? (
            <>
              <p>
                {evidence.product.name} ·{" "}
                {evidence.product.accountingRule.value}
              </p>
              <div className="branch-day-actions">
                {Object.entries(evidence.product.accountingMappings ?? {}).map(
                  ([key, account]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGl(String(account.id))}
                    >
                      {key} → {account.name ?? account.id}
                    </button>
                  ),
                )}
              </div>
              {!evidence.product.accountingMappings && (
                <p>No mapping returned. No GL association inferred.</p>
              )}
            </>
          ) : (
            <p>Loan product mapping unavailable.</p>
          )}
          <div className="branch-day-actions branch-day-filters">
            <label>
              Loan chart / control account
              <select value={gl} onChange={(e) => setGl(e.target.value)}>
                <option value="">All GLs in this owned loan subledger</option>
                {evidence.chart?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.glCode} · {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {evidence.journals?.pageItems.length ?? "Unavailable"} validated
            loan rows from {evidence.coverage.sourceRows} provider rows on this
            page · {evidence.coverage.excludedRows} counterpart/unidentified
            rows excluded. Provider group labels are never parsed to infer
            transaction identities. Journal presence does not establish balanced
            books or settlement.
          </p>
          <nav aria-label="Loan journal pages" className="branch-day-actions">
            <button
              type="button"
              disabled={loading || offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 200))}
            >
              Previous loan journal page
            </button>
            <span>Provider offset {offset} · page limit200</span>
            <button
              type="button"
              disabled={loading || !evidence.coverage.hasMore}
              onClick={() => setOffset(offset + 200)}
            >
              Next loan journal page
            </button>
          </nav>
          {evidence.journals ? (
            <CoreTableScroll label="Owned loan journal table">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Journal / provider group</th>
                    <th>Date / originating office</th>
                    <th>GL</th>
                    <th>Entry / amount · INR</th>
                    <th>Exact native transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => {
                    const tx = matchedLoanTransaction(evidence, j);
                    return (
                      <tr key={j.id}>
                        <td>
                          {j.id}
                          <small>{j.transactionId}</small>
                        </td>
                        <td>
                          {coreDate(j.transactionDate)}
                          <small>{j.officeName ?? j.officeId}</small>
                        </td>
                        <td>
                          {j.glAccountCode} · {j.glAccountName}
                        </td>
                        <td>
                          {j.entryType.value} · {formatMoney(j.amount)}
                          <JournalComputation
                            computed={j.runningBalanceComputed}
                          />
                          <small>
                            Core reversal flag:{" "}
                            {j.reversed === undefined
                              ? "Not returned"
                              : j.reversed
                                ? "Yes"
                                : "No"}
                          </small>
                        </td>
                        <td>
                          {tx ? (
                            <button
                              type="button"
                              onClick={() => setTransactionId(tx.id)}
                            >
                              Inspect Core transaction {tx.id}
                            </button>
                          ) : (
                            "No verified native transaction association"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CoreTableScroll>
          ) : (
            <p>Loan journal evidence unavailable.</p>
          )}
          {evidence.journals && !rows.length && (
            <p>
              No journal rows returned for this page/filter. This does not prove
              a zero GL balance or reconciliation.
            </p>
          )}
          <JournalComputationNote />
          {transaction && (
            <article
              className="branch-day-item"
              aria-label="Loan transaction and posting provenance"
            >
              <h4>Core loan transaction {transaction.id}</h4>
              <p>
                {transaction.type.value ?? `Core type ${transaction.type.id}`} ·{" "}
                {coreDate(transaction.date)} · {formatMoney(transaction.amount)}{" "}
                · INR
              </p>
              <p>
                Manual reversal flag:{" "}
                {transaction.manuallyReversed === undefined
                  ? "Not returned"
                  : transaction.manuallyReversed
                    ? "Yes"
                    : "No"}
                . Native transaction evidence is separate from saved workflow
                acknowledgement.
              </p>
              {!rows.some(
                (j) =>
                  matchedLoanTransaction(evidence, j)?.id === transaction.id,
              ) && (
                <p>
                  The selected Core transaction is outside this journal
                  page/filter; its owned detail remains visible.
                </p>
              )}
              {receipt ? (
                <>
                  <h5>Saved {receipt.kind} receipt</h5>
                  <p>
                    Original record {receipt.recordId} · operation{" "}
                    {receipt.operationId} · actor {receipt.actor} · confirmed
                    acknowledgement observed{" "}
                    {new Date(receipt.observedAt).toLocaleString("en-IN")}.
                  </p>
                  <p>
                    Matched through validated stored native transaction ID{" "}
                    {receipt.transactionId}. Historical acknowledgement does not
                    prove current balances, unreversed effects, physical cash or
                    settlement.
                  </p>
                  {!receipt.historyComplete && (
                    <p role="alert">
                      Only the first100 saved events are shown.
                    </p>
                  )}
                  <ol>
                    {receipt.history.map((event) => (
                      <li key={event.id}>
                        {event.createdAt} UTC · {event.actor} · {event.action} /{" "}
                        {event.kind} · version {event.version}
                        <p>{event.note}</p>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>
                  No verified saved posting receipt for this Core transaction.
                  No application source is inferred from journal labels or
                  amounts.
                </p>
              )}
            </article>
          )}
          <h4>Reconciliation evidence</h4>
          <p>
            Unreconciled. External settlement statements, physical cash counts
            and close evidence are unavailable. Product mappings, matching
            transaction references and equal debit/credit arithmetic cannot
            certify settlement or branch close.
          </p>
        </>
      )}
    </section>
  );
}
