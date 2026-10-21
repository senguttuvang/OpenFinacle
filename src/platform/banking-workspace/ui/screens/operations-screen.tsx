"use client";

import { LockKeyhole, RefreshCw } from "lucide-react";
import { formatMoney } from "../../domain/banking";
import type { WorkspaceContext } from "../use-banking-workspace";
import { PendingButton, Pill } from "../workspace-presentation";
export function OperationsScreen({ context }: { context: WorkspaceContext }) {
  const { data, view, busy, instruction, role, account, balance } = context;
  return (
    <>
      {view === "operations" && (
        <>
          <div className="stats-row">
            <div>
              <span>Customer savings</span>
              <strong>{formatMoney(balance)}</strong>
              <small>A/C {account?.accountNo ?? "Pending opening"}</small>
            </div>
            <div>
              <span>Beneficiary savings</span>
              <strong>
                {formatMoney(data.recipient.summary?.accountBalance ?? 0)}
              </strong>
              <small>{data.recipient.clientName}</small>
            </div>
            <div>
              <span>Employer funding</span>
              <strong>
                {formatMoney(data.employer?.summary?.accountBalance ?? 0)}
              </strong>
              <small>Northstar Studio</small>
            </div>
          </div>
          <div className="form-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Account controls</h2>
                  <p>Debit restrictions require separate approval.</p>
                </div>
                <LockKeyhole size={21} />
              </div>
              <div className="notice neutral">
                Current core status: {account?.status.value ?? "No account"}
                {account?.subStatus?.value
                  ? ` · ${account.subStatus.value}`
                  : ""}
              </div>
              <div className="button-row">
                <PendingButton
                  busy={busy}
                  className="secondary"
                  disabled={!account || role !== "officer"}
                  onClick={() =>
                    instruction("freeze", 0, "Place debit restriction")
                  }
                >
                  Restrict debits
                </PendingButton>
                <PendingButton
                  busy={busy}
                  className="secondary"
                  disabled={!account || role !== "officer"}
                  onClick={() =>
                    instruction("unfreeze", 0, "Release debit restriction")
                  }
                >
                  Release restriction
                </PendingButton>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Cash corrections</h2>
                  <p>Reverse the posting; preserve the original record.</p>
                </div>
                <RefreshCw size={21} />
              </div>
              {data.commands
                .filter(
                  (c) =>
                    ["deposit", "withdrawal"].includes(c.kind) &&
                    c.status === "posted",
                )
                .map((c) => (
                  <div className="request" key={c.id}>
                    <div>
                      <strong>{c.description}</strong>
                      <p>
                        {formatMoney(c.amount_minor / 100)} · Core #{c.core_id}
                      </p>
                    </div>
                    <PendingButton
                      busy={busy}
                      className="secondary"
                      disabled={
                        role !== "officer" ||
                        data.commands.some(
                          (r) =>
                            r.kind === "reverse" &&
                            r.payload.includes(c.id) &&
                            [
                              "posted",
                              "pending",
                              "executing",
                              "uncertain",
                            ].includes(r.status),
                        )
                      }
                      onClick={() =>
                        instruction(
                          "reverse",
                          0,
                          `Reverse cash posting #${c.core_id}`,
                          { originalId: c.id },
                        )
                      }
                    >
                      Request reversal
                    </PendingButton>
                  </div>
                ))}
            </section>
          </div>
          <section className="panel spaced">
            <div className="panel-heading">
              <div>
                <h2>Instruction register</h2>
                <p>Every command, including declines and exceptions.</p>
              </div>
            </div>
            {data.commands.map((c) => (
              <div className="register-item" key={c.id}>
                <div>
                  <strong>{c.description}</strong>
                  <small>
                    {c.error ?? `Core reference: ${c.core_id ?? "not posted"}`}
                  </small>
                </div>
                <span>{formatMoney(c.amount_minor / 100)}</span>
                <Pill status={c.status} />
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
