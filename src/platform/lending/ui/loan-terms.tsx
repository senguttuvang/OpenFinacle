"use client";

import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import {
  bankingDate,
  formatMoney,
} from "../../banking-workspace/domain/banking";
import type { LoanQuotePreview } from "../domain/origination/loan-workflow";
import {
  type LoanQuote,
  type LoanSchedule,
  type LoanTerms,
  normalizeLoanTerms,
} from "../domain/origination/loans";

export const loanDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export function LoanScheduleTable({ schedule }: { schedule: LoanSchedule }) {
  return (
    <section
      className="loan-schedule table-scroll"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: This horizontally scrollable schedule needs keyboard focus at large text and narrow widths.
      tabIndex={0}
      aria-label="Repayment schedule, scroll horizontally if needed"
    >
      <table>
        <caption>Core repayment schedule</caption>
        <thead>
          <tr>
            <th scope="col">Installment</th>
            <th scope="col">Due date</th>
            <th scope="col">Principal</th>
            <th scope="col">Interest</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {schedule.installments.map((row) => (
            <tr key={row.period}>
              <th scope="row">{row.period}</th>
              <td>{loanDate(row.due_date)}</td>
              <td>{formatMoney(row.principal_minor / 100)}</td>
              <td>{formatMoney(row.interest_minor / 100)}</td>
              <td>{formatMoney(row.total_minor / 100)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total
            </th>
            <td>{formatMoney(schedule.principal_minor / 100)}</td>
            <td>{formatMoney(schedule.interest_minor / 100)}</td>
            <td>{formatMoney(schedule.repayment_minor / 100)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
export function LoanQuoteFacts({ quote }: { quote: LoanQuote }) {
  return (
    <dl className="detail-grid deposit-facts">
      <div>
        <dt>Principal</dt>
        <dd>{formatMoney(quote.terms.principal)}</dd>
      </div>
      <div>
        <dt>Repayment term</dt>
        <dd>{quote.terms.months} months</dd>
      </div>
      <div>
        <dt>Purpose</dt>
        <dd className="loan-capitalize">{quote.terms.purpose}</dd>
      </div>
      <div>
        <dt>Annual nominal rate</dt>
        <dd>12% · declining balance</dd>
      </div>
      <div>
        <dt>Core scheduled interest</dt>
        <dd>{formatMoney(quote.schedule.interest_minor / 100)}</dd>
      </div>
      <div>
        <dt>Core scheduled repayment</dt>
        <dd>{formatMoney(quote.schedule.repayment_minor / 100)}</dd>
      </div>
      <div>
        <dt>Fees in this product</dt>
        <dd>{formatMoney(0)}</dd>
      </div>
      <div>
        <dt>Funding day</dt>
        <dd>{loanDate(quote.expected_disbursement_date)}</dd>
      </div>
    </dl>
  );
}
export function LoanApplicationForm({
  busy,
  quote,
  requestQuote,
  submit,
  cancel,
  pending,
}: {
  busy: boolean;
  quote: LoanQuotePreview | null;
  requestQuote: (terms: LoanTerms) => void;
  submit: () => void;
  cancel: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(true);
  const [terms, setTerms] = useState({
    principal: "12000",
    months: "12",
    purpose: "education",
    monthly_income: "",
    monthly_commitments: "",
    monthly_expenses: "",
  });
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [now, setNow] = useState(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (quote) {
      setEditing(false);
      setConsent(false);
    }
  }, [quote]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: editing });
  }, [editing]);
  useEffect(() => {
    if (!quote || editing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote, editing]);
  const deadline = quote
    ? Math.min(
        quote.quote.expires_at,
        Date.parse(`${quote.quote.expected_disbursement_date}T00:00:00+05:30`) +
          86400000,
      )
    : 0;
  const expired =
    quote !== null &&
    (now >= deadline ||
      bankingDate(now) !== quote.quote.expected_disbursement_date);
  const review = quote !== null && !editing;
  const locked = busy || pending;
  return (
    <form
      className="deposit-form loan-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (review) {
          if (
            consent &&
            !expired &&
            quote.affordability.within_declared_surplus
          )
            submit();
          return;
        }
        setError("");
        void Effect.runPromise(
          normalizeLoanTerms({
            product: "core-personal",
            principal: Number(terms.principal),
            months: Number(terms.months),
            purpose: terms.purpose,
            monthly_income: Number(terms.monthly_income),
            monthly_commitments: Number(terms.monthly_commitments),
            monthly_expenses: Number(terms.monthly_expenses),
          }).pipe(
            Effect.match({
              onFailure: (failure) => setError(failure.message),
              onSuccess: requestQuote,
            }),
          ),
        );
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        {review ? "Review loan application" : "New personal loan"}
      </h3>
      <p>
        Demonstration lending through Fineract. A quote creates no application
        and posts no money.
      </p>
      {error && <p role="alert">{error}</p>}
      {review ? (
        <>
          <LoanQuoteFacts quote={quote.quote} />
          <h4>Declared monthly budget</h4>
          <dl className="detail-grid">
            <div>
              <dt>Income</dt>
              <dd>{formatMoney(quote.quote.terms.monthly_income)}</dd>
            </div>
            <div>
              <dt>Existing commitments</dt>
              <dd>{formatMoney(quote.quote.terms.monthly_commitments)}</dd>
            </div>
            <div>
              <dt>Living expenses</dt>
              <dd>{formatMoney(quote.quote.terms.monthly_expenses)}</dd>
            </div>
            <div>
              <dt>Declared surplus</dt>
              <dd>{formatMoney(quote.affordability.surplus_minor / 100)}</dd>
            </div>
            <div>
              <dt>Largest installment</dt>
              <dd>
                {formatMoney(
                  quote.affordability.maximum_installment_minor / 100,
                )}
              </dd>
            </div>
          </dl>
          <p role="status">
            {expired
              ? "This quote expired. Edit the terms and get a new quote."
              : `Quote valid until ${new Date(deadline).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST. Branch registration must finish before expiry. Approval and funding require the displayed funding day.`}
          </p>
          {!quote.affordability.within_declared_surplus && (
            <p role="alert">
              The largest installment exceeds your declared surplus. Edit the
              terms before applying.
            </p>
          )}
          <LoanScheduleTable schedule={quote.quote.schedule} />
          <label className="deposit-choice">
            <input
              type="checkbox"
              checked={consent}
              required
              disabled={
                locked ||
                expired ||
                !quote.affordability.within_declared_surplus
              }
              onChange={(event) => setConsent(event.target.checked)}
            />
            I accept these Core-calculated terms and repayment schedule and
            confirm my declared budget.
          </label>
          <p>
            Submission goes to officer assessment. Registration, approval and
            disbursement are separate approver decisions. Disbursement credits
            savings; an unconfirmed result must be inspected before another
            financial instruction.
          </p>
        </>
      ) : (
        <fieldset disabled={locked}>
          <legend>Loan and declared budget</legend>
          <label>
            Principal (₹)
            <input
              type="number"
              min={10000}
              max={500000}
              step={1000}
              required
              value={terms.principal}
              onChange={(event) =>
                setTerms({ ...terms, principal: event.target.value })
              }
              aria-describedby="loan-principal-help"
            />
          </label>
          <p id="loan-principal-help">₹10,000–₹5,00,000 in steps of ₹1,000.</p>
          <fieldset>
            <legend>Repayment term</legend>
            {[12, 24, 36].map((months) => (
              <label className="deposit-choice" key={months}>
                <input
                  type="radio"
                  name="loan-term"
                  value={months}
                  checked={terms.months === String(months)}
                  onChange={(event) =>
                    setTerms({ ...terms, months: event.target.value })
                  }
                />
                {months} months
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Purpose</legend>
            {["education", "home", "medical", "other"].map((purpose) => (
              <label className="deposit-choice loan-capitalize" key={purpose}>
                <input
                  type="radio"
                  name="loan-purpose"
                  value={purpose}
                  checked={terms.purpose === purpose}
                  onChange={(event) =>
                    setTerms({ ...terms, purpose: event.target.value })
                  }
                />
                {purpose}
              </label>
            ))}
          </fieldset>
          {(
            [
              ["monthly_income", "Monthly income (₹)", 5000],
              ["monthly_commitments", "Existing monthly commitments (₹)", 0],
              ["monthly_expenses", "Monthly living expenses (₹)", 0],
            ] as const
          ).map(([field, label, min]) => (
            <label key={field}>
              {label}
              <input
                type="number"
                min={min}
                max={1000000}
                step={1}
                required
                value={terms[field]}
                onChange={(event) =>
                  setTerms({ ...terms, [field]: event.target.value })
                }
              />
            </label>
          ))}
          <p>
            Use independently invented demonstration figures. The budget check
            supports review; it is not credit approval.
          </p>
        </fieldset>
      )}
      <div className="form-actions">
        {review ? (
          <>
            <button
              className="primary"
              type="submit"
              disabled={
                locked ||
                expired ||
                !quote.affordability.within_declared_surplus
              }
            >
              {busy ? "Saving application…" : "Accept & submit application"}
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setEditing(true);
                setConsent(false);
                setError("");
              }}
            >
              Edit loan terms
            </button>
          </>
        ) : (
          <button className="primary" type="submit" disabled={locked}>
            {busy ? "Calculating Core quote…" : "Get Core quote"}
          </button>
        )}
        <button type="button" disabled={locked} onClick={cancel}>
          Leave loan application
        </button>
      </div>
    </form>
  );
}
