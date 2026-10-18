"use client";

import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import {
  type PayeeList,
  type PayeeReview,
  payeeListApi,
  payeeReviewApi,
} from "./customer-payee-api";

export function CustomerPayees({
  payees,
  onChanged,
}: {
  payees: PayeeList;
  onChanged: (value: PayeeList) => void;
}) {
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [review, setReview] = useState<PayeeReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const perform = <T,>(
    task: Effect.Effect<T, { message: string }>,
    receive: (value: T) => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    void Effect.runPromise(
      task.pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            if (active.current) receive(value);
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active.current) setError(failure.message);
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active.current) setBusy(false);
          }),
        ),
      ),
    );
  };
  return (
    <details className="customer-payees">
      <summary>Manage saved payees ({payees.count})</summary>
      <p>
        Add an OpenFinacle branch account using details shared by its holder.
        Removing a payee keeps your transfer history.
      </p>
      {payees.payees.length === 0 && (
        <p>No saved payees yet. Add a payee to make your first transfer.</p>
      )}
      <ul aria-label="Saved payees">
        {payees.payees.map((payee) => (
          <li key={payee.id}>
            {payee.display_name} · ending {payee.account_suffix}{" "}
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                perform(
                  payeeListApi("/remove", { payeeId: payee.id }),
                  (value) => {
                    onChanged(value);
                    setNotice(
                      `${payee.display_name} removed from saved payees.`,
                    );
                  },
                )
              }
              aria-label={`Remove ${payee.display_name}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {!review ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            perform(
              payeeReviewApi(holderName.trim(), accountNumber.trim()),
              setReview,
            );
          }}
        >
          <label htmlFor="payee-holder-name">Account holder name</label>
          <input
            id="payee-holder-name"
            value={holderName}
            onChange={(event) => setHolderName(event.target.value)}
            required
            minLength={2}
            maxLength={120}
            disabled={busy}
          />
          <label htmlFor="payee-account-number">Account number</label>
          <input
            id="payee-account-number"
            value={accountNumber}
            onChange={(event) => setAccountNumber(event.target.value)}
            required
            maxLength={100}
            pattern="[a-zA-Z0-9-]+"
            disabled={busy}
          />
          <button
            type="submit"
            className="secondary"
            disabled={busy || payees.count >= payees.maximum}
          >
            Review payee
          </button>
          {payees.count >= payees.maximum && (
            <p>
              Demo safety limit: {payees.maximum} active payees. Remove one
              before adding another.
            </p>
          )}
        </form>
      ) : (
        <div>
          <h3>Check payee details</h3>
          <p>
            {review.display_name} · account ending {review.account_suffix}
          </p>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              perform(
                payeeListApi("/confirm", { reviewId: review.review_id }),
                (value) => {
                  onChanged(value);
                  setReview(null);
                  setHolderName("");
                  setAccountNumber("");
                  setNotice(
                    "Payee saved. You can now select this account for a transfer.",
                  );
                },
              )
            }
          >
            Confirm saved payee
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setReview(null)}
          >
            Change payee details
          </button>
        </div>
      )}
      {busy && <p role="status">Checking saved payee details…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
    </details>
  );
}
