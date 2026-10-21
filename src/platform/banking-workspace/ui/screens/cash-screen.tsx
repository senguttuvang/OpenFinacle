"use client";

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { formatMoney } from "../../domain/banking";
import type { WorkspaceContext } from "../use-banking-workspace";
import { PendingButton } from "../workspace-presentation";
export function CashScreen({ context }: { context: WorkspaceContext }) {
  const {
    data,
    view,
    busy,
    cashKind,
    setCashKind,
    cashAmount,
    setCashAmount,
    changeRole,
    instruction,
    role,
    account,
  } = context;
  return (
    <>
      {view === "cash" && (
        <div className="form-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Prepare a banking instruction</h2>
                <p>
                  Customer:{" "}
                  {account?.clientName ??
                    data.application?.name ??
                    "Account not yet opened"}
                </p>
              </div>
              <Wallet size={21} />
            </div>
            <div className="segmented">
              {(["deposit", "withdrawal", "salary"] as const).map((kind) => (
                <button
                  className={cashKind === kind ? "selected" : ""}
                  type="button"
                  key={kind}
                  onClick={() => {
                    setCashKind(kind);
                    setCashAmount(kind === "salary" ? "85000" : "10000");
                  }}
                >
                  {kind === "salary"
                    ? "Salary credit"
                    : kind === "deposit"
                      ? "Cash deposit"
                      : "Withdrawal"}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                instruction(
                  cashKind,
                  Number(cashAmount),
                  cashKind === "salary"
                    ? "Salary · Northstar Studio"
                    : cashKind === "deposit"
                      ? "Cash deposit · Adyar branch"
                      : "Cash withdrawal · Adyar branch",
                );
              }}
            >
              <label>
                Customer account
                <input
                  readOnly
                  value={account?.accountNo ?? "Account opening required"}
                />
              </label>
              <label>
                Amount (INR)
                <div className="money-input">
                  <span>₹</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                  />
                </div>
              </label>
              {cashKind === "salary" && (
                <div className="notice neutral">
                  <Building2 size={20} />
                  <div>
                    From Northstar Studio
                    <small>
                      Employer balance:{" "}
                      {formatMoney(data.employer?.summary?.accountBalance ?? 0)}
                      . This is an account-to-account transfer, not a balance
                      adjustment.
                    </small>
                  </div>
                </div>
              )}
              <PendingButton
                busy={busy}
                className="primary"
                disabled={!account || role !== "officer"}
                type="submit"
              >
                Send for approval <ArrowRight size={16} />
              </PendingButton>
            </form>
          </section>
          <section className="info-panel">
            <ShieldCheck size={35} />
            <h2>
              One instruction.
              <br />
              Two people.
            </h2>
            <p>
              The officer prepares the instruction. The approver checks it. Only
              then does the core post it.
            </p>
            <div className="info-line">
              <CheckCircle2 size={17} />
              No editable account balances
            </div>
            <div className="info-line">
              <CheckCircle2 size={17} />
              No duplicate posting on approval
            </div>
            <div className="info-line">
              <CheckCircle2 size={17} />
              Traceable core reference
            </div>
            <button
              className="secondary"
              type="button"
              onClick={() => changeRole("approver", "approvals")}
            >
              Open approver's inbox <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
