"use client";
import { useState } from "react";
import { formatMoney } from "../../banking-workspace/domain/banking";
import {
  serviceReference,
  serviceStatus,
} from "../../service-requests/ui/service-case-detail";
import {
  type BranchDay,
  branchDepositProducts,
  type branchTotals,
  unresolvedStatuses,
} from "../domain/branch-day";

import {
  branchServiceWork,
  hasUnverifiedDelivery,
  isOpenServiceRequest,
} from "../domain/service-work";
import {
  filterRelationships,
  productKey,
  relationshipWork,
} from "../domain/work-filters";
import type { BranchMutation } from "./branch-day-actions";

import { BranchAdvances } from "./loans/branch-advances";
import { ProcessingEnquiry } from "./processing-evidence";

type OpenCommand = (
  id: string,
  customer: string,
  filterCustomer?: string,
) => void;
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
  const products = branchDepositProducts(day);
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
          movements, native interest and fees. Native credit/debit entry types
          classify them; missing direction/reversal evidence withholds totals.
          They are not external branch inflow/outflow or physical cash proof.
        </p>
        {totals.complete && products.complete ? (
          products.products.map(({ id, name, balanceMinor }) => (
            <p key={id}>
              {name} · Core product {id}:{" "}
              <strong>
                {balanceMinor === null
                  ? "Incomplete"
                  : formatMoney(balanceMinor / 100)}
              </strong>
            </p>
          ))
        ) : (
          <p>
            Totals withheld until every registered account has complete INR
            evidence, a native product ID and safe monetary subtotals.
          </p>
        )}
        <p>
          Native loan exposure is available in the registered-client enquiry
          above. Fixed and recurring deposits: consolidated core-backed branch
          totals are not implemented.
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
  openCommand,
}: {
  day: BranchDay;
  openCustomer: (id: string) => void;
  openCommand: OpenCommand;
}) {
  const [query, setQuery] = useState("");
  const [work, setWork] = useState("all");
  const [product, setProduct] = useState("all");
  const rows = filterRelationships(day, query, work, product);
  const products = new Map(
    day.relationships.map((r) => [
      productKey(r),
      r.account?.savingsProductName ??
        (productKey(r) === "unknown"
          ? "Product not returned"
          : `Core product ${productKey(r)}`),
    ]),
  );
  return (
    <section className="panel">
      <h3>Customer directory</h3>
      <label>
        Search name, reference or account
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="branch-day-actions branch-day-filters">
        <label>
          Customer work filter
          <select value={work} onChange={(e) => setWork(e.target.value)}>
            <option value="all">All relationships</option>
            <option value="instructions">Unresolved instructions</option>
            <option value="services">Service work / delivery exceptions</option>
            <option value="core">Core account unavailable</option>
          </select>
        </label>
        <label>
          Savings product filter
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="all">All loaded products</option>
            {[...products].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setWork("all");
          setProduct("all");
        }}
      >
        Clear customer filters
      </button>
      <p>
        Filters apply to loaded records only; they do not change branch totals
        or certify that all work is listed. Service work includes unverified
        delivery on completed requests.
      </p>
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
              <th>Work in loaded records</th>
              <th>Enquiry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((relationship) => {
              const { customer } = relationship;
              const work = relationshipWork(relationship);
              const first = relationship.commands.find((c) =>
                unresolvedStatuses.has(c.status),
              );
              return (
                <tr key={customer.id}>
                  <td>
                    {customer.display_name}
                    <small>{customer.reference}</small>
                  </td>
                  <td>{customer.account_no}</td>
                  <td>{customer.origin}</td>
                  <td>
                    {first ? (
                      <button
                        type="button"
                        onClick={() =>
                          openCommand(first.id, customer.id, customer.id)
                        }
                      >
                        {work.instructions} unresolved instructions
                      </button>
                    ) : (
                      <span>0 unresolved instructions</span>
                    )}
                    <small>
                      {work.services} service work / delivery exceptions
                    </small>
                    {!relationship.account && (
                      <small>Core account unavailable</small>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => openCustomer(customer.id)}
                    >
                      Open customer 360
                    </button>
                  </td>
                </tr>
              );
            })}
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
  openLoan,
}: {
  day: BranchDay;
  busy: boolean;
  mutate: BranchMutation;
  openCommand: OpenCommand;
  openCustomer: (id: string) => void;
  openLoan: (customer: string, loan: number) => void;
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
          Physical count verification and vault handover: unsupported. Saved
          synthetic count declarations above do not certify cash variance.
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
      <ProcessingEnquiry
        customerId={day.relationships[0]?.customer.id ?? ""}
        branchId={day.branchId}
        reviewFixture={day.reviewFixture}
      />
      <BranchAdvances day={day} openLoan={openLoan} daily />
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
