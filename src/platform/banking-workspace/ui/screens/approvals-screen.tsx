"use client";

import { Check, CheckCheck } from "lucide-react";
import { formatMoney } from "../../domain/banking";
import { api } from "../api";
import type { WorkspaceContext } from "../use-banking-workspace";
import { PendingButton } from "../workspace-presentation";
export function ApprovalsScreen({ context }: { context: WorkspaceContext }) {
  const { data, view, busy, perform, changeRole, role, account, pending } =
    context;
  return (
    <>
      {view === "approvals" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Ready for a second look{" "}
                <span className="count">{pending.length}</span>
              </h2>
              <p>
                {role === "approver"
                  ? "Your decisions execute against the banking core."
                  : "Only the separate approver can authorise these instructions."}
              </p>
            </div>
            {role !== "approver" && (
              <button
                className="primary"
                type="button"
                onClick={() => changeRole("approver", "approvals")}
              >
                Switch to approver
              </button>
            )}
          </div>
          {pending.length ? (
            pending.map((c) => (
              <article className="approval-card" key={c.id}>
                <div>
                  <span className="eyebrow">
                    {c.kind.toUpperCase()} · BY {c.maker.toUpperCase()}
                  </span>
                  <h3>{c.description}</h3>
                  <p>
                    {data.application?.name} · A/C {account?.accountNo}
                  </p>
                  <small className="reference">
                    Instruction {c.id.slice(0, 8)}
                  </small>
                </div>
                <div className="approval-right">
                  <strong>
                    {c.amount_minor
                      ? formatMoney(c.amount_minor / 100)
                      : c.kind.replaceAll("_", " ")}
                  </strong>
                  <div className="button-row">
                    <PendingButton
                      busy={busy}
                      className="secondary"
                      disabled={role !== "approver"}
                      onClick={() =>
                        perform(
                          api("/commands/reject", { id: c.id }),
                          "Instruction declined.",
                        )
                      }
                    >
                      Decline
                    </PendingButton>
                    <PendingButton
                      busy={busy}
                      className="primary"
                      disabled={role !== "approver"}
                      onClick={() =>
                        perform(
                          api("/commands/approve", { id: c.id }),
                          "Instruction posted. Account balances are updated.",
                        )
                      }
                    >
                      Approve <Check size={15} />
                    </PendingButton>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <CheckCheck size={32} />
              <h3>All caught up</h3>
              <p>
                New instructions appear here when they need independent
                approval.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
