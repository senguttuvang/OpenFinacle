"use client";

import { formatMoney, type Role } from "../src/domain/banking";
import type { LoanDetail } from "../src/domain/loan-workflow";
import type { LoanCommand } from "../src/domain/loans";
import { loanActionLabel, loanReference, loanStatus } from "./loan-api";
import { LoanQuoteFacts, LoanScheduleTable, loanDate } from "./loan-terms";

export const loanActionHelp: Record<LoanCommand["action"], string> = {
  cancel:
    "Cancel this application before Core registration. The accepted quote and history remain saved.",
  recommend:
    "Review the declared budget, purpose and Core schedule. Your assessment is separate from approver authorization.",
  reject:
    "Reject this application before Core registration. Record the assessment reason.",
  register:
    "Register the accepted application in Fineract. This stage does not credit savings.",
  approve:
    "Approve the accepted principal and funding day in Fineract. This stage does not credit savings.",
  disburse:
    "Post one full principal disbursement to this relationship’s owned savings account. An unconfirmed result blocks further instructions until inspected.",
  request_withdrawal:
    "Record your withdrawal intent and block funding. The branch must complete the separate Core withdrawal steps.",
  undo_approval:
    "Undo the unfunded approval in Fineract. Withdrawal intent remains saved; withdrawal is a later separate instruction.",
  withdraw:
    "Withdraw the registered, unfunded Core application after customer intent. This does not reverse an active loan.",
};
const actorLabel = {
  customer: "Customer",
  officer: "Bank officer",
  approver: "Approver",
};
export function LoanDetailView({
  detail,
  role,
  busy,
  locked,
  choose,
  inspect,
  refresh,
}: {
  detail: LoanDetail;
  role: Role;
  busy: boolean;
  locked: boolean;
  choose: (action: LoanCommand["action"]) => void;
  inspect: () => void;
  refresh: () => void;
}) {
  const { loan, quote, core, operation } = detail;
  const unresolved =
    operation?.status === "executing" || operation?.status === "uncertain";
  return (
    <>
      <header className="loan-detail-heading">
        <div>
          <h3>{loanReference(loan.id)}</h3>
          <p>
            {loan.origin === "admin-pilot"
              ? "Operator demonstration"
              : "Customer application"}{" "}
            · {loanStatus(loan.status)}
          </p>
        </div>
        <span
          className={`pill ${loan.status === "active" ? "success" : "pending"}`}
        >
          {loanStatus(loan.status)}
        </span>
      </header>
      {unresolved && (
        <div className="loan-warning" role="status">
          <h4>Original instruction needs inspection</h4>
          <p>
            {loanActionLabel[operation.action]} is {operation.status}. Saved
            balances and loan observations may omit an effect. Do not send
            another financial instruction.
          </p>
          <p>
            Original key:{" "}
            <span className="loan-reference">{operation.key}</span>
          </p>
          {role === "approver" ? (
            <button type="button" disabled={busy} onClick={inspect}>
              Inspect original Core outcome
            </button>
          ) : (
            <p>
              An approver can inspect the original outcome. Your saved receipt
              and history remain available.
            </p>
          )}
        </div>
      )}
      {loan.withdrawal_requested && (
        <p className="loan-warning">
          Customer withdrawal requested. Funding is blocked. An approved
          application needs undo approval before a separate withdrawal.
        </p>
      )}
      {detail.financial_view_stale && (
        <p role="status">
          Savings synchronization is stale. Confirmed posting and balance
          refresh are separate; check the original instruction before another
          financial action.
        </p>
      )}
      <LoanQuoteFacts quote={quote} />
      <details className="loan-disclosure">
        <summary>Accepted terms, declared budget & schedule</summary>
        <dl className="detail-grid">
          <div>
            <dt>Acceptance recorded</dt>
            <dd>{new Date(loan.accepted_at).toLocaleString("en-IN")}</dd>
          </div>
          <div>
            <dt>Monthly income</dt>
            <dd>{formatMoney(quote.terms.monthly_income)}</dd>
          </div>
          <div>
            <dt>Existing monthly commitments</dt>
            <dd>{formatMoney(quote.terms.monthly_commitments)}</dd>
          </div>
          <div>
            <dt>Monthly living expenses</dt>
            <dd>{formatMoney(quote.terms.monthly_expenses)}</dd>
          </div>
        </dl>
        <LoanScheduleTable schedule={quote.schedule} />
      </details>
      <section className="loan-core" aria-label="Saved Core observation">
        <div className="panel-heading">
          <h4>Saved Fineract observation</h4>
          {loan.core_id !== null && (
            <button
              type="button"
              disabled={busy || unresolved}
              onClick={refresh}
            >
              Refresh Core observation
            </button>
          )}
        </div>
        {core ? (
          <>
            <p>
              {core.stale
                ? "Observation is stale. Refresh explicitly before relying on current Core facts."
                : "Saved observation"}{" "}
              · {new Date(core.synced_at).toLocaleString("en-IN")}
            </p>
            <dl className="detail-grid">
              <div>
                <dt>Core loan</dt>
                <dd>#{core.snapshot.id}</dd>
              </div>
              <div>
                <dt>Last observed status</dt>
                <dd>{loanStatus(core.snapshot.status)}</dd>
              </div>
              <div>
                <dt>Observed outstanding</dt>
                <dd>
                  {core.snapshot.outstanding_minor === null
                    ? "Not recorded"
                    : formatMoney(core.snapshot.outstanding_minor / 100)}
                </dd>
              </div>
              <div>
                <dt>Actual disbursement day</dt>
                <dd>
                  {core.snapshot.actual_disbursement_date
                    ? loanDate(core.snapshot.actual_disbursement_date)
                    : "Not recorded"}
                </dd>
              </div>
            </dl>
            {core.snapshot.schedule && (
              <LoanScheduleTable schedule={core.snapshot.schedule} />
            )}
          </>
        ) : (
          <p>
            No verified Core observation is saved yet. Check any unresolved
            original instruction before relying on its outcome.
          </p>
        )}
      </section>
      {detail.unavailable_reason && (
        <p role="status">{detail.unavailable_reason}</p>
      )}
      {operation?.status === "failed" && (
        <p role="status">
          The original {loanActionLabel[operation.action].toLowerCase()} attempt
          was definitely rejected. Its outcome remains in history. Any further
          offered action requires a new review and key.
        </p>
      )}
      {detail.actions.length > 0 && (
        <fieldset className="form-actions loan-decisions">
          <legend>Loan decisions</legend>
          {detail.actions.map((action) => (
            <button
              type="button"
              key={action}
              className={action === "disburse" ? "primary" : "secondary"}
              disabled={locked}
              onClick={() => choose(action)}
            >
              {loanActionLabel[action]}
            </button>
          ))}
        </fieldset>
      )}
      {detail.actions.length === 0 && !unresolved && (
        <p>No loan decisions are available for your role in this state.</p>
      )}
      <section className="loan-history" aria-label="Loan history">
        <h4>Saved history · {detail.history.length} events</h4>
        <ol>
          {detail.history.map((event) => (
            <li key={event.id}>
              <strong>
                {event.action === "submit"
                  ? "Application accepted"
                  : loanActionLabel[event.action]}{" "}
                ·{" "}
                {event.kind === "started"
                  ? "Started"
                  : event.kind === "outcome"
                    ? event.operation_status
                    : "Recorded"}
              </strong>
              <p>
                {actorLabel[event.actor]} ·{" "}
                {new Date(event.created_at).toLocaleString("en-IN")} · version{" "}
                {event.version}
              </p>
              <p>{event.note}</p>
            </li>
          ))}
        </ol>
      </section>
      {loan.status === "active" && (
        <p>
          Repayment posting and fuller servicing are not available in this
          workspace yet.
        </p>
      )}
    </>
  );
}
