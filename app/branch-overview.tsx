"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { formatMoney } from "../src/domain/banking";
import type { Dashboard } from "../src/domain/view";
import type { View } from "./navigation";

interface QueueItem {
  id: string;
  label: string;
  detail: string;
  status: string;
  amount?: number;
  destination: View;
}
const attentionStates = new Set([
  "submitted",
  "awaiting_approval",
  "pending",
  "uncertain",
  "failed",
  "opening_exception",
  "open",
  "needs_changes",
]);
const readable = (value: string) => value.replaceAll("_", " ");

export function BranchOverview({
  data,
  navigate,
}: {
  data: Dashboard;
  navigate: (view: View) => void;
}) {
  const [query, setQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(true);
  const application = data.application;
  const pending = data.commands.filter((item) => item.status === "pending");
  const exceptions = data.commands.filter((item) =>
    ["uncertain", "failed"].includes(item.status),
  );
  const openRequests = data.requests.filter((item) => item.status === "open");
  const items: QueueItem[] = [
    ...(application
      ? [
          {
            id: application.id,
            label: "Account opening",
            detail: application.name,
            status: application.status,
            destination: "application" as const,
          },
        ]
      : []),
    ...data.commands.map(
      (item): QueueItem => ({
        id: item.id,
        label: readable(item.kind),
        detail: item.description,
        status: item.status,
        amount: item.amount_minor / 100,
        destination: item.status === "pending" ? "approvals" : "operations",
      }),
    ),
    ...data.requests.map(
      (item): QueueItem => ({
        id: item.id,
        label: readable(item.kind),
        detail: item.detail,
        status: item.status,
        destination: "services",
      }),
    ),
  ];
  const attention = items.filter((item) => attentionStates.has(item.status));
  const filtered = (attentionOnly ? attention : items).filter((item) =>
    `${item.label} ${item.detail} ${item.id} ${readable(item.status)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const approvalCount =
    pending.length + Number(application?.status === "awaiting_approval");
  const exceptionCount =
    exceptions.length + Number(application?.status === "opening_exception");
  const metrics = [
    {
      label: "Awaiting authorization",
      count: approvalCount,
      icon: ShieldCheck,
      destination: (application?.status === "awaiting_approval"
        ? "application"
        : "approvals") as View,
      detail: "Independent review required",
    },
    {
      label: "Applications to review",
      count: Number(application?.status === "submitted"),
      icon: FileCheck2,
      destination: "application" as View,
      detail: "Customer onboarding",
    },
    {
      label: "Open service requests",
      count: openRequests.length,
      icon: Wallet,
      destination: "services" as View,
      detail: "Cards, cheques and updates",
    },
    {
      label: "Exceptions",
      count: exceptionCount,
      icon: CircleAlert,
      destination: (application?.status === "opening_exception"
        ? "application"
        : "operations") as View,
      detail: "Inspect before resubmitting",
    },
  ];
  return (
    <div className="branch-overview">
      <div className="branch-context">
        <span className="branch-context-dot" />
        <strong>Adyar · Chennai</strong>
        <span>Single customer demo</span>
        <span className="branch-context-date">
          Business date: {data.businessDate}
        </span>
      </div>
      <section
        className="branch-metrics"
        aria-label="Current customer work queues"
      >
        {metrics.map(({ label, count, icon: Icon, destination, detail }) => (
          <button
            type="button"
            className="branch-metric"
            key={label}
            onClick={() => navigate(destination)}
          >
            <span className="branch-metric-top">
              <span>{label}</span>
              <Icon size={18} />
            </span>
            <strong>{count.toString().padStart(2, "0")}</strong>
            <span className="branch-metric-bottom">
              {detail}
              <ArrowUpRight size={15} />
            </span>
          </button>
        ))}
      </section>
      <div className="branch-columns">
        <div className="branch-primary">
          <section className="panel branch-queue">
            <div className="panel-heading">
              <div>
                <h2>Work queue</h2>
                <p>
                  Applications, instructions and requests for this relationship.
                </p>
              </div>
              <span className="branch-total">{items.length} records</span>
            </div>
            <div className="branch-queue-tools">
              <fieldset className="branch-filters" aria-label="Queue filter">
                <button
                  type="button"
                  aria-pressed={attentionOnly}
                  onClick={() => setAttentionOnly(true)}
                >
                  Needs attention <span>{attention.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={!attentionOnly}
                  onClick={() => setAttentionOnly(false)}
                >
                  All records
                </button>
              </fieldset>
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="Search work queue"
                  placeholder="Search queue…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
            <div className="table-scroll">
              <table className="branch-table">
                <thead>
                  <tr>
                    <th>Work item</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Open screen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 10).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </td>
                      <td className="reference">{item.id.slice(0, 8)}</td>
                      <td>{item.amount ? formatMoney(item.amount) : "—"}</td>
                      <td>
                        <span
                          className={`branch-status ${attentionStates.has(item.status) ? "needs-attention" : ""}`}
                        >
                          {readable(item.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="branch-open"
                          aria-label={`Open ${item.label} ${item.id.slice(0, 8)}`}
                          onClick={() => navigate(item.destination)}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <div className="empty-state">
                <CheckCircle2 size={28} />
                <h3>
                  {query
                    ? "No matching work items"
                    : attentionOnly
                      ? "Your queue is clear"
                      : "No work items yet"}
                </h3>
                <p>
                  {query
                    ? "Try another description or reference."
                    : "New customer applications and instructions appear here."}
                </p>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    if (query) setQuery("");
                    else if (attentionOnly) setAttentionOnly(false);
                    else navigate("cash");
                  }}
                >
                  {query
                    ? "Clear search"
                    : attentionOnly
                      ? "View all records"
                      : "Open cash desk"}
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
            {!!filtered.length && (
              <div className="branch-table-footer">
                Showing {Math.min(10, filtered.length)} of {filtered.length}{" "}
                matching records. Open a screen to review the full record.
              </div>
            )}
          </section>
          <section className="panel branch-shortcuts">
            <div className="panel-heading">
              <div>
                <h2>Daily operations</h2>
                <p>Open a screen. Review the instruction before submitting.</p>
              </div>
            </div>
            <div className="branch-operation-grid">
              {(
                [
                  {
                    title: "Cash desk",
                    code: "TM",
                    view: "cash",
                    note: "Deposits, withdrawals, salary",
                  },
                  {
                    title: "Authorization",
                    code: "FTI",
                    view: "approvals",
                    note: "Independent instruction review",
                  },
                  {
                    title: "Account controls",
                    code: "AFSM",
                    view: "operations",
                    note: "Restrictions and cash corrections",
                  },
                  {
                    title: "Service desk",
                    code: "CREQ",
                    view: "services",
                    note: "Customer requests and outcomes",
                  },
                ] as const
              ).map((item) => (
                <button
                  type="button"
                  key={item.code}
                  onClick={() => navigate(item.view)}
                >
                  <kbd>{item.code}</kbd>
                  <strong>{item.title}</strong>
                  <small>{item.note}</small>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className="branch-secondary">
          <section className="branch-relationship">
            <span className="eyebrow">CURRENT RELATIONSHIP</span>
            <div className="branch-customer-icon">
              {(data.account?.clientName ?? application?.name ?? "New customer")
                .split(" ")
                .map((word) => word[0])
                .slice(0, 2)
                .join("")}
            </div>
            <h2>
              {data.account?.clientName ?? application?.name ?? "New customer"}
            </h2>
            <p>
              {data.account
                ? "Everyday Savings · Personal banking"
                : "Customer onboarding"}
            </p>
            <dl>
              <div>
                <dt>Account</dt>
                <dd>{data.account?.accountNo ?? "Not yet opened"}</dd>
              </div>
              <div>
                <dt>Saved balance</dt>
                <dd>
                  {data.account
                    ? formatMoney(data.account.summary?.accountBalance ?? 0)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {data.account?.status.value ??
                    readable(application?.status ?? "Not started")}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() =>
                navigate(data.account ? "accounts" : "application")
              }
            >
              View relationship <ArrowRight size={16} />
            </button>
          </section>
          <section className="panel branch-control">
            <ShieldCheck size={21} />
            <h2>Control checks</h2>
            <div>
              <span>Maker / checker</span>
              <strong>
                {data.role === "approver"
                  ? "Independent approver"
                  : "Officer prepares instructions"}
              </strong>
            </div>
            <div>
              <span>Debit restrictions</span>
              <strong>
                {data.account?.subStatus?.block ||
                data.account?.subStatus?.blockDebit
                  ? "Restricted"
                  : data.account
                    ? "No restriction reported"
                    : "Account not open"}
              </strong>
            </div>
            <div>
              <span>Account data</span>
              <strong>
                {data.core.stale ? "Refresh needed" : "Saved core response"}
              </strong>
              <small>
                Last synced{" "}
                {data.core.syncedAt
                  ? new Date(data.core.syncedAt).toLocaleString("en-IN")
                  : "not available"}
              </small>
            </div>
            {exceptions.some((item) => item.status === "uncertain") && (
              <p className="branch-exception">
                An outcome needs reconciliation. Inspect its core reference
                before another instruction.
              </p>
            )}
          </section>
          <button
            className="branch-audit-link"
            type="button"
            onClick={() => navigate("audit")}
          >
            <span>
              <strong>Follow the activity trail</strong>
              <small>{data.audit.length} recorded events</small>
            </span>
            <ArrowRight size={18} />
          </button>
        </aside>
      </div>
    </div>
  );
}
