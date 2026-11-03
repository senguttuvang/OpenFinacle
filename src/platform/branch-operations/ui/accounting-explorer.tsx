"use client";
import { Effect } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../banking-workspace/ui/api";
import type { AccountingEvidence } from "../domain/accounting";
import { type BranchRelationship, coreDate } from "../domain/branch-day";
export function AccountingExplorer({
  relationship: r,
  businessDate,
  openCommand,
}: {
  relationship: BranchRelationship;
  businessDate: string;
  openCommand: (id: string, customer: string) => void;
}) {
  const [evidence, setEvidence] = useState<AccountingEvidence | null>(null);
  const [error, setError] = useState("");
  const [gl, setGl] = useState("");
  useEffect(() => {
    let active = true;
    Effect.runPromise(
      api<AccountingEvidence>(
        `/branch/accounting?customerId=${encodeURIComponent(r.customer.id)}`,
      ),
    )
      .then((value) => {
        if (active) setEvidence(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [r.customer.id]);
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
        Source: Fineract account-filtered journals and chart. Journal
        dates/currencies are shown per row; this enquiry includes historical
        entries. Observed{" "}
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
      {journals && (
        <p>
          {journals.pageItems.length} of {journals.totalFilteredRecords} core
          journal rows loaded.{" "}
          {journals.totalFilteredRecords > journals.pageItems.length
            ? "Partial evidence: first 200 only. Reconciliation remains incomplete."
            : "No settlement or reconciliation certificate is supplied by this enquiry."}
        </p>
      )}
      <div className="table-scroll">
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
      </div>
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
