"use client";
import { useState } from "react";
import { formatMoney } from "../../banking-workspace/domain/banking";
import {
  serviceReference,
  serviceStatus,
} from "../../service-requests/ui/service-case-detail";
import {
  type BranchDay,
  type branchTotals,
  unresolvedStatuses,
} from "../domain/branch-day";

import {
  branchServiceWork,
  hasUnverifiedDelivery,
  isOpenServiceRequest,
} from "../domain/service-work";
import type { BranchMutation } from "./branch-day-actions";

type OpenCommand = (id: string, customer: string) => void;
export function BranchSummary({
  day,
  totals,
  openCustomer,
  openCommand,
  daily,
}: {
  day: BranchDay;
  totals: ReturnType<typeof branchTotals>;
  openCustomer: (id: string) => void;
  openCommand: OpenCommand;
  daily: () => void;
}) {
  const items = day.relationships.flatMap((r) =>
    r.commands
      .filter((c) => unresolvedStatuses.has(c.status))
      .map((command) => ({ command, customer: r.customer })),
  );
  const products = new Map<string, number>();
  for (const { account } of day.relationships)
    if (account?.summary && account.currency?.code === "INR") {
      const name =
        account.savingsProductName ??
        `Core savings product ${account.savingsProductId ?? "unknown"}`;
      products.set(
        name,
        (products.get(name) ?? 0) +
          Math.round(account.summary.accountBalance * 100),
      );
    }
  return (
    <>
      <section className="branch-metrics" aria-label="Registered savings scope">
        {[
          ["Registered INR savings ledger", totals.balanceMinor],
          ["Today’s account credits", totals.creditsMinor],
          ["Today’s account debits", totals.debitsMinor],
        ].map(([label, amount]) => (
          <div className="branch-metric" key={label}>
            <span>{label}</span>
            <strong>
              {totals.complete
                ? formatMoney(Number(amount) / 100)
                : "Incomplete"}
            </strong>
            <small>
              {day.businessDate} · {day.branchId} ·{" "}
              {day.reviewFixture
                ? "invented review values"
                : "core observation above"}
            </small>
          </div>
        ))}
        <button type="button" className="branch-metric" onClick={daily}>
          <span>Close readiness</span>
          <strong>Blocked</strong>
          <small>
            {items.length} unresolved instructions + unverified cash /
            settlement
          </small>
        </button>
      </section>
      <section className="panel">
        <h3>Deposits by product</h3>
        <p>
          Registered savings accounts only. Credits/debits include internal
          movements; they are not external branch inflow/outflow or physical
          cash proof.
        </p>
        {totals.complete ? (
          [...products].map(([name, amount]) => (
            <p key={name}>
              {name}: <strong>{formatMoney(amount / 100)}</strong>
            </p>
          ))
        ) : (
          <p>
            Totals withheld until every registered account has complete INR
            evidence.
          </p>
        )}
        <p>
          Advances, fixed and recurring deposits: consolidated core-backed
          branch totals are not implemented.
        </p>
        {day.relationships.map((r) => (
          <button
            type="button"
            key={r.customer.id}
            onClick={() => openCustomer(r.customer.id)}
          >
            {r.customer.display_name} ·{" "}
            {r.account ? "Account enquiry" : r.error}
          </button>
        ))}
      </section>
      <section className="panel">
        <h3>Pending decisions and exceptions</h3>
        {items.length ? (
          items.map(({ command, customer }) => (
            <p key={command.id}>
              <button
                type="button"
                onClick={() => openCommand(command.id, customer.id)}
              >
                {customer.display_name} · {command.kind} · {command.status} ·{" "}
                {command.id}
              </button>
            </p>
          ))
        ) : (
          <p>
            No unresolved instructions in the loaded scope. Physical cash,
            settlement and close controls remain unverified.
          </p>
        )}
      </section>
    </>
  );
}
export function CustomerDirectory({
  day,
  openCustomer,
}: {
  day: BranchDay;
  openCustomer: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = day.relationships.filter((r) =>
    `${r.customer.display_name} ${r.customer.reference} ${r.customer.account_no}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <h3>Customer directory</h3>
      <label>
        Search name, reference or account
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <p>
        {rows.length} of {day.relationships.length} loaded relationships ·{" "}
        {day.branchId}
      </p>
      <div className="table-scroll">
        <table className="branch-table">
          <thead>
            <tr>
              <th>Relationship</th>
              <th>Account</th>
              <th>Origin</th>
              <th>Enquiry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ customer }) => (
              <tr key={customer.id}>
                <td>
                  {customer.display_name}
                  <small>{customer.reference}</small>
                </td>
                <td>{customer.account_no}</td>
                <td>{customer.origin}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => openCustomer(customer.id)}
                  >
                    Open customer 360
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>No matching registered relationships.</p>}
      <p>
        Names may identify people or businesses; verified legal entity
        classification, business mandates, signatories, nominees and real KYC
        documents are not implemented.
      </p>
    </section>
  );
}
export function DailyControl({
  day,
  busy,
  mutate,
  openCommand,
  openCustomer,
}: {
  day: BranchDay;
  busy: boolean;
  mutate: BranchMutation;
  openCommand: OpenCommand;
  openCustomer: (id: string) => void;
}) {
  const serviceItems = branchServiceWork(day);
  const items = day.relationships.flatMap((r) =>
    r.commands
      .filter((c) => unresolvedStatuses.has(c.status))
      .map((command) => ({ command, customer: r.customer })),
  );
  return (
    <section className="panel">
      <span className="eyebrow">Close readiness · blocked</span>
      <h3>Daily control register</h3>
      <p>
        Business date {day.businessDate} · branch {day.branchId} · INR ·
        observation above.
      </p>
      <ul>
        <li>
          Physical teller counts and vault handover: unsupported; no cash
          variance certified.
        </li>
        <li>
          External settlement matching and reconciliation evidence: unavailable.
        </li>
        <li>Core processing / COB completion: not verified.</li>
        <li>
          Account-owning and originating office matching: inspect core
          accounting; servicing branch is an application scope.
        </li>
        <li>
          Open service requests:{" "}
          {day.relationships.reduce(
            (n, r) => n + r.requests.filter(isOpenServiceRequest).length,
            0,
          )}
          . Audit enquiry is bounded to the latest 100 events per customer.
        </li>
      </ul>
      <h4>Service work and delivery exceptions</h4>
      <p>
        Saved application workflow only. Completed requests can still have
        outstanding or missing delivery evidence. Last recorded actors are not
        responsibility assignments.
      </p>
      {day.coverage.workflowLimited && (
        <p role="alert">
          Workflow coverage is incomplete; this queue cannot establish that all
          branch work is listed.
        </p>
      )}
      {serviceItems.map(({ customer, request }) => (
        <article className="branch-day-item" key={request.id}>
          <button type="button" onClick={() => openCustomer(customer.id)}>
            {customer.display_name} · {serviceReference(request.id)} ·{" "}
            {request.kind}
          </button>
          <p>
            {serviceStatus(request.status)} · {request.detail}
          </p>
          {hasUnverifiedDelivery(request) && (
            <p>
              Delivery exception:{" "}
              {request.delivery_status
                ? serviceStatus(request.delivery_status)
                : "Evidence not returned"}
            </p>
          )}
          <small>
            Created {request.created_at} UTC · Last actor:{" "}
            {request.updated_by || "Not returned"}
          </small>
        </article>
      ))}
      {!serviceItems.length && (
        <p>
          No open requests or delivery exceptions in the loaded scope. This is
          not evidence of branch close or physical delivery.
        </p>
      )}
      <h4>Unresolved instructions · assign responsibility</h4>
      <p>
        Assignments persist as workflow labels. They grant no approval authority
        and do not resolve an exception.
      </p>
      {items.map(({ command, customer }) => {
        const assignment = day.responsibilities.find(
          (a) => a.command_id === command.id,
        );
        return (
          <article className="branch-day-item" key={command.id}>
            <button
              type="button"
              onClick={() => openCommand(command.id, customer.id)}
            >
              {customer.display_name} · {command.kind} · {command.status}
            </button>
            <p>{command.error ?? command.description}</p>
            <label>
              Owner for {command.id}
              <select
                disabled={busy}
                value={assignment?.owner ?? ""}
                onChange={(e) =>
                  void mutate("/branch/assign", {
                    customerId: customer.id,
                    commandId: command.id,
                    owner: e.target.value,
                    version: assignment?.version ?? 0,
                  })
                }
              >
                <option value="" disabled>
                  Unassigned
                </option>
                {["teller", "checker", "manager", "accountant"].map((owner) => (
                  <option key={owner}>{owner}</option>
                ))}
              </select>
            </label>
            <small>
              Version {assignment?.version ?? 0} ·{" "}
              {assignment?.updated_at ?? "No assignment"}
            </small>
          </article>
        );
      })}
      {!items.length && (
        <p>
          No unresolved instructions in loaded scope. This is not a branch close
          certificate.
        </p>
      )}
    </section>
  );
}
