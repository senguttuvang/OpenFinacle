"use client";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../banking-workspace/ui/api";
import { AccountingEvidence } from "../domain/accounting";
import { type BranchRelationship, coreDate } from "../domain/branch-day";
import {
  JournalComputation,
  JournalComputationNote,
} from "./accounting/journal-computation";
import { CoreTableScroll } from "./core-table-scroll";
export function AccountingExplorer({
  relationship: r,
  reviewFixture,
  businessDate,
  openCommand,
  openRegisteredGl,
}: {
  relationship: BranchRelationship;
  reviewFixture?: boolean;
  businessDate: string;
  openCommand: (id: string, customer: string) => void;
  openRegisteredGl: (gl: number) => void;
}) {
  const [evidence, setEvidence] = useState<AccountingEvidence | null>(null);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [gl, setGl] = useState("");
  useEffect(() => {
    let active = true;
    setEvidence(null);
    setError("");
    Effect.runPromise(
      api<unknown>(
        `/branch/accounting?customerId=${encodeURIComponent(r.customer.id)}&offset=${offset}`,
      ).pipe(Effect.flatMap(Schema.decodeUnknown(AccountingEvidence))),
    )
      .then((value) => {
        if (active) setEvidence(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Accounting evidence is unavailable or invalid. Choose the account again to read.",
          );
      });
    return () => {
      active = false;
    };
  }, [r.customer.id, offset]);
  const journals = evidence?.journals;
  const rows =
    journals?.pageItems.filter((j) => !gl || String(j.glAccountId) === gl) ??
    [];
  return (
    <section className="panel">
      <span className="eyebrow">
        GL → product / customer subledger → journal → instruction
      </span>
      <h3>Accounting explorer</h3>
      <p>
        {r.customer.display_name} · savings account {r.customer.account_no} ·
        servicing branch {r.customer.branch_id} · business date {businessDate}
      </p>
      <p>
        Source:{" "}
        {reviewFixture
          ? "STATIC REVIEW FIXTURE — no core evidence"
          : "Fineract account-filtered journals and chart"}
        . Journal dates/currencies are shown per row; this enquiry includes
        historical entries. Observed{" "}
        {evidence
          ? new Date(evidence.observedAt).toLocaleString("en-IN")
          : "pending"}
        .
      </p>
      {error && <p role="alert">{error}</p>}
      {!evidence && !error && (
        <p role="status">Reading core accounting evidence…</p>
      )}
      {evidence?.errors.map((item) => (
        <p role="alert" key={item}>
          {item}
        </p>
      ))}
      <h4>Core product mapping</h4>
      {evidence?.product ? (
        <>
          <p>
            {evidence.product.name} · {evidence.product.accountingRule.value}
          </p>
          {Object.entries(evidence.product.accountingMappings ?? {}).map(
            ([name, value]) => (
              <p key={name}>
                <button type="button" onClick={() => setGl(String(value.id))}>
                  {name} → {value.name ?? value.id}
                </button>
              </p>
            ),
          )}
          {!evidence.product.accountingMappings && (
            <p>Mappings not returned. No GL relationship inferred.</p>
          )}
        </>
      ) : (
        <p>Product accounting mapping unavailable.</p>
      )}
      <label>
        Chart / control account
        <select value={gl} onChange={(e) => setGl(e.target.value)}>
          <option value="">All GLs in selected savings subledger</option>
          {evidence?.chart?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.glCode} · {g.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={
          reviewFixture || !Number.isSafeInteger(Number(gl)) || Number(gl) <= 0
        }
        onClick={() => openRegisteredGl(Number(gl))}
      >
        Enquire GL across registered branch relationships
      </button>
      {journals && (
        <p>
          {journals.pageItems.length} validated savings rows from{" "}
          {evidence?.coverage.sourceRows ?? journals.pageItems.length} provider
          rows on this page · {journals.totalFilteredRecords} total provider
          rows. {evidence?.coverage.excludedRows ?? 0} counterpart/unidentified
          rows withheld. This is not a balanced journal or settlement
          certificate.
        </p>
      )}
      {evidence && (
        <nav className="branch-day-actions" aria-label="Journal pages">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 200))}
          >
            Previous journal page
          </button>
          <span>
            {evidence.coverage.sourceRows
              ? `Provider rows ${offset + 1}–${offset + evidence.coverage.sourceRows}`
              : "No provider rows on this page"}
          </span>
          <button
            type="button"
            disabled={!evidence.coverage.hasMore}
            onClick={() => setOffset(offset + 200)}
          >
            Next journal page
          </button>
        </nav>
      )}
      <CoreTableScroll label="Owned savings journal table">
        <table className="branch-table">
          <thead>
            <tr>
              <th>Journal / transaction</th>
              <th>Date / originating office</th>
              <th>GL</th>
              <th>Entry / currency / amount</th>
              <th>Originating operation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              // Match only explicit Core entity references, never arithmetic or guessed transaction prefixes.
              const command =
                j.entityId !== r.customer.account_id ||
                j.entityType?.id !== 2 ||
                !j.transactionDetails
                  ? undefined
                  : r.commands.find(
                      (c) =>
                        c.core_id === j.transactionDetails?.transactionId &&
                        ["deposit", "withdrawal"].includes(c.kind),
                    );
              return (
                <tr key={j.id}>
                  <td>
                    {j.id} / {j.transactionId}
                  </td>
                  <td>
                    {coreDate([...j.transactionDate])} /{" "}
                    {j.officeName ?? j.officeId}
                  </td>
                  <td>
                    {j.glAccountCode} · {j.glAccountName}
                  </td>
                  <td>
                    {j.entryType.value} · {j.currency.code} ·{" "}
                    {j.amount.toLocaleString("en-IN")}{" "}
                    {j.reversed ? "· Reversed" : ""}
                    <JournalComputation computed={j.runningBalanceComputed} />
                  </td>
                  <td>
                    {command ? (
                      <button
                        type="button"
                        onClick={() => openCommand(command.id, r.customer.id)}
                      >
                        {command.id}
                      </button>
                    ) : (
                      "No verified application instruction mapping"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CoreTableScroll>
      <JournalComputationNote />
      {journals && !rows.length && (
        <p>
          No journal rows returned for this filter. This does not prove zero GL
          balance or reconciliation.
        </p>
      )}
      <h4>Reconciliation evidence</h4>
      <p>
        Unreconciled. No external statement, physical cash count or settlement
        match is attached. Journal availability and equal debit/credit
        arithmetic cannot establish settlement.
      </p>
    </section>
  );
}
