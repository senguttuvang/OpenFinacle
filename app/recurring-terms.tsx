"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../src/domain/banking";
import {
  type RecurringTerms,
  recurringMaturityMinor,
} from "../src/domain/recurring-deposits";

export const recurringAction = {
  recommend: "Recommend for approval",
  activate: "Activate demo plan",
  reject: "Reject application",
  cancel: "Cancel application",
  allocate: "Record demo installment",
};
export function RecurringFacts({ terms }: { terms: RecurringTerms }) {
  return (
    <dl className="detail-grid deposit-facts">
      <div>
        <dt>Plan or goal</dt>
        <dd>{terms.label || "Recurring plan"}</dd>
      </div>
      <div>
        <dt>Monthly demo allocation</dt>
        <dd>{formatMoney(terms.amount)}</dd>
      </div>
      <div>
        <dt>Term</dt>
        <dd>{terms.months} months</dd>
      </div>
      <div>
        <dt>Subsequent monthly day</dt>
        <dd>Day {terms.day}</dd>
      </div>
      <div>
        <dt>Planned allocations</dt>
        <dd>{formatMoney(terms.amount * terms.months)}</dd>
      </div>
      <div>
        <dt>Illustrated maturity amount</dt>
        <dd>{formatMoney(recurringMaturityMinor(terms) / 100)}</dd>
      </div>
      <div>
        <dt>Illustrative annual rate</dt>
        <dd>6% · month-prorated simple interest</dd>
      </div>
      <div>
        <dt>Adult nominee</dt>
        <dd>
          {terms.nominee
            ? `${terms.nominee.name} · ${terms.nominee.relationship}`
            : "No nominee selected"}
        </dd>
      </div>
    </dl>
  );
}
export function RecurringForm({
  disabled,
  submit,
  cancel,
}: {
  disabled: boolean;
  submit: (terms: RecurringTerms) => void;
  cancel: () => void;
}) {
  const [terms, setTerms] = useState<RecurringTerms>({
    product: "demo-recurring",
    amount: 1000,
    months: 12,
    day: 15,
    label: "",
    nominee: null,
  });
  const [review, setReview] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: !review });
  }, [review]);
  return (
    <form
      className="deposit-form"
      onSubmit={(event) => {
        event.preventDefault();
        setReview(true);
      }}
    >
      <h3 ref={title} tabIndex={-1}>
        {review
          ? "Review recurring-deposit application"
          : "New recurring deposit"}
      </h3>
      <p>
        Fixed monthly demo allocations. No savings debit, standing instruction
        or external settlement.
      </p>
      {review ? (
        <RecurringFacts terms={terms} />
      ) : (
        <fieldset disabled={disabled}>
          <legend>Recurring-plan details</legend>
          <label>
            Monthly demo allocation (₹)
            <input
              required
              type="number"
              min={500}
              max={100000}
              step={100}
              value={terms.amount}
              onChange={(event) =>
                setTerms({ ...terms, amount: Number(event.target.value) })
              }
              aria-describedby="recurring-amount-help"
            />
          </label>
          <p id="recurring-amount-help">
            ₹500–₹1,00,000 in ₹100 increments. Each allocation is recorded
            explicitly; your savings balance stays unchanged.
          </p>
          <label>
            Term in months
            <input
              required
              type="number"
              min={6}
              max={120}
              step={3}
              value={terms.months}
              onChange={(event) =>
                setTerms({ ...terms, months: Number(event.target.value) })
              }
              aria-describedby="recurring-term-help"
            />
          </label>
          <p id="recurring-term-help">6–120 months, in three-month steps.</p>
          <label>
            Subsequent monthly day
            <input
              required
              type="number"
              min={1}
              max={28}
              step={1}
              value={terms.day}
              onChange={(event) =>
                setTerms({ ...terms, day: Number(event.target.value) })
              }
              aria-describedby="recurring-day-help"
            />
          </label>
          <p id="recurring-day-help">
            The first installment is due on activation. Later installments fall
            on your selected day, from 1–28.
          </p>
          <label>
            Plan or goal name (optional)
            <input
              maxLength={80}
              value={terms.label}
              onChange={(event) =>
                setTerms({ ...terms, label: event.target.value })
              }
            />
          </label>
          <fieldset>
            <legend>Adult nominee</legend>
            <label className="deposit-choice">
              <input
                type="checkbox"
                checked={terms.nominee !== null}
                onChange={(event) =>
                  setTerms({
                    ...terms,
                    nominee: event.target.checked
                      ? { name: "", relationship: "parent" }
                      : null,
                  })
                }
              />
              Add an adult nominee
            </label>
            {terms.nominee && (
              <>
                <label>
                  Nominee name
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={terms.nominee.name}
                    onBlur={() =>
                      setTerms({
                        ...terms,
                        nominee: terms.nominee
                          ? {
                              ...terms.nominee,
                              name: terms.nominee.name.trim(),
                            }
                          : null,
                      })
                    }
                    onChange={(event) =>
                      setTerms({
                        ...terms,
                        nominee: {
                          name: event.target.value,
                          relationship: terms.nominee?.relationship ?? "parent",
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Relationship
                  <select
                    value={terms.nominee.relationship}
                    onChange={(event) =>
                      setTerms({
                        ...terms,
                        nominee: {
                          name: terms.nominee?.name ?? "",
                          relationship: event.target.value as NonNullable<
                            RecurringTerms["nominee"]
                          >["relationship"],
                        },
                      })
                    }
                  >
                    {["spouse", "parent", "child", "sibling", "other"].map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </>
            )}
          </fieldset>
        </fieldset>
      )}
      <p>
        The maturity illustration assumes all planned allocations on time at a
        demo 6% annual simple rate. No interest, fee or maturity proceeds are
        credited.
      </p>
      {review && (
        <p>
          An officer reviews the application before a separate approver
          activates the plan. You will record each due demo installment
          separately.
        </p>
      )}
      <div className="card-actions">
        {review ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setReview(false)}
            >
              Edit recurring application
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => submit(terms)}
            >
              Submit recurring application
            </button>
          </>
        ) : (
          <button type="submit" disabled={disabled}>
            Review recurring application
          </button>
        )}
        <button type="button" disabled={disabled} onClick={cancel}>
          Leave recurring application
        </button>
      </div>
    </form>
  );
}
