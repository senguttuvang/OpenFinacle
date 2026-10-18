"use client";

import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  Plus,
  Send,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { View } from "../../../navigation/ui/navigation";
import { formatMoney } from "../../domain/banking";
import type { WorkspaceContext } from "../use-banking-workspace";
import { Pill } from "../workspace-presentation";
export function OverviewScreen({ context }: { context: WorkspaceContext }) {
  const {
    data,
    view,
    setView,
    busy,
    staff,
    retail,
    account,
    balance,
    journeySteps,
    progress,
    nextStep,
  } = context;
  return (
    <>
      {view === "overview" && !retail && !staff && (
        <>
          <div className="overview-grid">
            <section className="balance-card">
              <div className="card-top">
                <span>
                  <Wallet size={18} /> EVERYDAY SAVINGS
                </span>
                <span className="card-bank">of.</span>
              </div>
              <div className="balance-label">
                {account ? "Your account balance" : "Your account starts here"}
              </div>
              <div className="balance-amount" data-testid="balance">
                {formatMoney(balance)}
              </div>
              <div className="account-number">
                {account
                  ? `A/C ${account.accountNo}  ·  ${account.status.value}`
                  : "Open an account to begin your banking story"}
              </div>
              <div className="balance-actions">
                <button
                  type="button"
                  onClick={() => setView(account ? "transfer" : "application")}
                >
                  {account ? <Send size={16} /> : <Plus size={16} />}
                  {account ? "Send money" : "Open account"}
                  <ArrowUpRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView("statements")}
                  disabled={!account}
                >
                  <FileText size={16} /> Statement
                </button>
              </div>
              <div className="balance-pattern" aria-hidden="true" />
            </section>
            <section className="next-step">
              <span className="eyebrow">
                <span className="step-spark">
                  <Sparkles size={15} />
                </span>{" "}
                YOUR NEXT STEP
              </span>
              <h2>{nextStep.title}</h2>
              <p>{nextStep.text}</p>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={nextStep.action}
              >
                {nextStep.button}
                <ArrowRight size={16} />
              </button>
              <div className="journey-progress">
                <div>
                  <span style={{ width: `${(progress / 6) * 100}%` }} />
                </div>
                <small>{progress} of 6 milestones complete</small>
              </div>
            </section>
          </div>
          <div className="quick-row">
            {[
              {
                icon: ArrowLeftRight,
                title: "Pay someone",
                subtitle: "Beneficiaries & transfers",
                destination: "transfer" as View,
              },
              {
                icon: ArrowDownToLine,
                title: "Your statements",
                subtitle: "Every transaction, clearly",
                destination: "statements" as View,
              },
              {
                icon: CreditCard,
                title: "At your service",
                subtitle: "Cards, cheques & requests",
                destination: "services" as View,
              },
            ].map(({ icon: Icon, title, subtitle, destination }) => (
              <button
                type="button"
                className="quick-item"
                key={title}
                onClick={() =>
                  setView(
                    staff && destination === "transfer" ? "cash" : destination,
                  )
                }
              >
                <span className="quick-icon">
                  <Icon size={20} />
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{subtitle}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <div className="lower-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p>A little context for every movement.</p>
                </div>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setView(staff ? "audit" : "statements")}
                >
                  View all <ArrowRight size={14} />
                </button>
              </div>
              {data.commands.length ? (
                <div className="activity-list">
                  {data.commands.slice(0, 5).map((c) => (
                    <div className="activity" key={c.id}>
                      <span
                        className={`activity-icon ${["deposit", "salary"].includes(c.kind) ? "incoming" : ""}`}
                      >
                        {["deposit", "salary"].includes(c.kind) ? (
                          <ArrowDownLeft size={19} />
                        ) : (
                          <ArrowUpRight size={19} />
                        )}
                      </span>
                      <div>
                        <strong>{c.description}</strong>
                        <small>
                          {c.kind.replaceAll("_", " ")} ·{" "}
                          {new Date(
                            `${c.created_at.replace(" ", "T")}Z`,
                          ).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </small>
                      </div>
                      <div className="activity-value">
                        <strong>
                          {c.amount_minor
                            ? formatMoney(c.amount_minor / 100)
                            : "Account control"}
                        </strong>
                        <Pill status={c.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <ArrowLeftRight size={26} />
                  <h3>
                    {data.bank.journey === "existing"
                      ? "Your account activity is ready"
                      : "Your story is just beginning"}
                  </h3>
                  <p>
                    {data.bank.journey === "existing"
                      ? "Inspect My accounts and the audit trail for the sample account setup. New instructions will appear here."
                      : "Deposits, payments and salary credits will appear here."}
                  </p>
                </div>
              )}
            </section>
            {data.bank.journey === "existing" && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Customer relationship</h2>
                    <p>Active savings · {account?.clientName}</p>
                  </div>
                </div>
                <div className="detail-grid">
                  <div>
                    <small>Customer account</small>
                    <strong>{account?.accountNo}</strong>
                  </div>
                  <div>
                    <small>Account status</small>
                    <strong>{account?.status.value}</strong>
                  </div>
                  <div>
                    <small>
                      {data.customer && !staff
                        ? "Saved payees"
                        : "Saved beneficiaries"}
                    </small>
                    <strong>
                      {data.customer && !staff
                        ? (data.payeeSummary?.count ?? 0)
                        : data.beneficiaries.length}
                    </strong>
                  </div>
                  <div>
                    <small>Open service requests</small>
                    <strong>
                      {
                        data.requests.filter(
                          (request) => request.status === "open",
                        ).length
                      }
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setView("accounts")}
                >
                  Inspect account details <ArrowRight size={15} />
                </button>
              </section>
            )}
            <section
              className="panel journey-panel"
              style={
                data.bank.journey === "existing"
                  ? { display: "none" }
                  : undefined
              }
            >
              <div className="panel-heading">
                <div>
                  <h2>From first hello to payday</h2>
                  <p>Your six-step banking journey.</p>
                </div>
              </div>
              {[
                "Submit your application",
                "Get your account opened",
                "Make an initial deposit",
                "Add a beneficiary",
                "Send your first transfer",
                "Receive your salary",
              ].map((step, i) => (
                <div
                  className={`journey-step ${journeySteps[i] ? "complete" : ""}`}
                  key={step}
                >
                  <span>{journeySteps[i] ? <Check size={13} /> : i + 1}</span>
                  <strong>{step}</strong>
                  {journeySteps[i] && <small>Done</small>}
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </>
  );
}
