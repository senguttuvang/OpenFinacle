"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../src/domain/banking";
import { type DepositTerms, maturityMinor } from "../src/domain/deposits";
import { FormSelect } from "./form-select";

export const depositStatus = {
  submitted: "Awaiting officer review",
  recommended: "Awaiting independent approval",
  active: "Active holding",
  rejected: "Rejected",
  cancelled: "Cancelled",
};
export const depositAction = {
  recommend: "Recommend for approval",
  activate: "Activate demo holding",
  reject: "Reject application",
  cancel: "Cancel application",
};
export function DepositFacts({ terms }: { terms: DepositTerms }) {
  return (
    <dl className="detail-grid deposit-facts">
      <div>
        <dt>Demo allocation</dt>
        <dd>{formatMoney(terms.amount)}</dd>
      </div>
      <div>
        <dt>Term</dt>
        <dd>{terms.months} months</dd>
      </div>
      <div>
        <dt>Illustrative annual rate</dt>
        <dd>6% · simple interest</dd>
      </div>
      <div>
        <dt>Illustrated maturity amount</dt>
        <dd>{formatMoney(maturityMinor(terms) / 100)}</dd>
      </div>
      <div>
        <dt>Maturity instruction</dt>
        <dd>
          {terms.maturity === "return_all"
            ? "Return principal and interest"
            : "Renew principal"}{" "}
          · recorded only
        </dd>
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
export function DepositForm({
  disabled,
  submit,
  cancel,
}: {
  disabled: boolean;
  submit: (terms: DepositTerms) => void;
  cancel: () => void;
}) {
  const [terms, setTerms] = useState<DepositTerms>({
    product: "demo-cumulative",
    amount: 10000,
    months: 12,
    maturity: "return_all",
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
        {review ? "Review fixed-deposit application" : "New fixed deposit"}
      </h3>
      <p>
        Cumulative demo deposit · 6% illustrative annual simple interest. No
        savings debit or external settlement.
      </p>
      {review ? (
        <DepositFacts terms={terms} />
      ) : (
        <fieldset disabled={disabled}>
          <legend>Deposit details</legend>
          <label>
            Demo allocation (₹)
            <input
              required
              type="number"
              min={1000}
              max={1000000}
              step={1}
              value={terms.amount}
              onChange={(event) =>
                setTerms({ ...terms, amount: Number(event.target.value) })
              }
              aria-describedby="allocation-help"
            />
          </label>
          <p id="allocation-help">
            Whole rupees from ₹1,000 to ₹10,00,000. This allocation does not
            reduce your account balance.
          </p>
          <fieldset>
            <legend>Term</legend>
            {([6, 12, 24] as const).map((months) => (
              <label className="deposit-choice" key={months}>
                <input
                  type="radio"
                  name="deposit-term"
                  checked={terms.months === months}
                  onChange={() => setTerms({ ...terms, months })}
                />
                {months} months
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>At maturity</legend>
            {(["return_all", "renew_principal"] as const).map((maturity) => (
              <label className="deposit-choice" key={maturity}>
                <input
                  type="radio"
                  name="deposit-maturity"
                  checked={terms.maturity === maturity}
                  onChange={() => setTerms({ ...terms, maturity })}
                />
                {maturity === "return_all"
                  ? "Return principal and interest"
                  : "Renew principal"}
              </label>
            ))}
            <p>
              Instruction recorded for this demo. Automatic renewal and payout
              are not available.
            </p>
          </fieldset>
          <fieldset>
            <legend>Adult nominee</legend>
            <label className="deposit-choice">
              <input
                type="radio"
                name="deposit-nominee"
                checked={terms.nominee === null}
                onChange={() => setTerms({ ...terms, nominee: null })}
              />
              No nominee
            </label>
            <label className="deposit-choice">
              <input
                type="radio"
                name="deposit-nominee"
                checked={terms.nominee !== null}
                onChange={() =>
                  setTerms({
                    ...terms,
                    nominee: { name: "", relationship: "parent" },
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
                  <FormSelect
                    aria-label="Relationship"
                    value={terms.nominee.relationship}
                    onValueChange={(value) => {
                      const relationship = value as NonNullable<
                        DepositTerms["nominee"]
                      >["relationship"];
                      setTerms({
                        ...terms,
                        nominee: {
                          name: terms.nominee?.name ?? "",
                          relationship,
                        },
                      });
                    }}
                    options={[
                      "spouse",
                      "parent",
                      "child",
                      "sibling",
                      "other",
                    ].map((value) => ({ value, label: value }))}
                  />
                </label>
              </>
            )}
          </fieldset>
        </fieldset>
      )}
      {review && (
        <p>
          The officer reviews this application before a separate approver
          activates a synthetic holding. This does not open a real bank deposit.
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
              Edit application
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => submit(terms)}
            >
              Submit demo application
            </button>
          </>
        ) : (
          <button type="submit" disabled={disabled}>
            Review application
          </button>
        )}
        <button type="button" disabled={disabled} onClick={cancel}>
          Leave application
        </button>
      </div>
    </form>
  );
}
