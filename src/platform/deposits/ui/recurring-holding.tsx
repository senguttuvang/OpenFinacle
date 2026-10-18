"use client";

import type { ReactNode, Ref } from "react";
import { formatMoney } from "../../banking-workspace/domain/banking";
import type { RecurringDetail } from "../domain/recurring-deposits";
import { DepositAdvicePreview } from "./deposit-advice";
import { depositStatus } from "./deposit-terms";
import { RecurringFacts, recurringAction } from "./recurring-terms";

export const recurringStatus = {
  ...depositStatus,
  active: "Active recurring plan",
};
export function RecurringHolding({
  detail,
  children,
  titleRef,
}: {
  detail: RecurringDetail;
  children?: ReactNode;
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const { plan } = detail;
  return (
    <div className="recurring-detail">
      <h3 ref={titleRef} tabIndex={-1}>
        RD-{plan.id.slice(0, 8).toUpperCase()} · {recurringStatus[plan.status]}
      </h3>
      <p>Explicit demo allocations only. Your savings account is unchanged.</p>
      <RecurringFacts terms={plan.terms} />
      <p>
        The maturity illustration assumes all planned allocations on time. No
        interest or maturity proceeds are credited.
      </p>
      {plan.status === "active" && (
        <dl className="detail-grid deposit-facts">
          <div>
            <dt>Recorded installments</dt>
            <dd>
              {plan.allocated_count} of {plan.terms.months}
            </dd>
          </div>
          <div>
            <dt>Recorded demo allocations</dt>
            <dd>{formatMoney(plan.allocated_minor / 100)}</dd>
          </div>
          <div>
            <dt>Activation date</dt>
            <dd>{plan.activated_at ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Scheduled maturity date</dt>
            <dd>{plan.maturity_date ?? "Unavailable"}</dd>
          </div>
        </dl>
      )}
      {plan.status === "active" && (
        <DepositAdvicePreview
          key={plan.id}
          bankId={plan.bank_id}
          id={plan.id}
          kind="recurring"
          busy={false}
        />
      )}
      {children}
      {detail.installments.length > 0 && (
        <details className="recurring-schedule">
          <summary>
            View {detail.installments.length} scheduled installments
          </summary>
          <p>
            Due and missed installments can be recorded in order. Future
            installments are not allocated automatically.
          </p>
          <ol>
            {detail.installments.map((item) => (
              <li key={item.period}>
                <div>
                  <strong>Installment {item.period}</strong>
                  <span>
                    Due {item.due_date} · {item.state}
                  </span>
                </div>
                <div>
                  <strong>{formatMoney(item.amount_minor / 100)}</strong>
                  <span>
                    {item.allocated_at
                      ? `Recorded ${item.allocated_at}`
                      : "No demo allocation recorded"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
      <h3>Plan history</h3>
      <ol className="card-history">
        {detail.history.map((event) => (
          <li key={event.id}>
            <strong>
              {event.action === "submit"
                ? "Application submitted"
                : (recurringAction[
                    event.action as keyof typeof recurringAction
                  ] ?? event.action)}
            </strong>
            <span>
              {event.actor} · {recurringStatus[event.status]} · Version{" "}
              {event.version}
              {event.period !== null ? ` · Installment ${event.period}` : ""}
            </span>
            <p>{event.note}</p>
            <small>{event.created_at}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
