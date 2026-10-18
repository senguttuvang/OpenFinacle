"use client";

import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../src/domain/banking";
import type {
  CustomerChoice,
  TransferOffer,
  TransferReceipt,
} from "../src/domain/customer-registry";
import { api } from "./api";

interface Review {
  offer: TransferOffer;
  sender_name: string;
  sender_suffix: string;
  recipient_name: string;
  recipient_suffix: string;
}
interface Outcome {
  id: string;
  status: string;
  receipt: TransferReceipt | null;
}
export function CustomerTransfer({
  bankId,
  onPosted,
}: {
  bankId: string;
  onPosted: () => void;
}) {
  const [recipients, setRecipients] = useState<CustomerChoice[]>([]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const key = useRef("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    void Effect.runPromise(
      api<{ customers: CustomerChoice[] }>("/customers/recipients").pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            if (active.current) setRecipients(value.customers);
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active.current) setError(failure.message);
          }),
        ),
      ),
    );
    void Effect.runPromise(
      api<{ transfers: { id: string; status: string }[] }>(
        "/customer-transfers/history",
      ).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            const unresolved = value.transfers.find((row) =>
              ["executing", "uncertain", "pending"].includes(row.status),
            );
            if (active.current && unresolved) {
              setLocked(true);
              setOutcome({ ...unresolved, receipt: null });
            }
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active.current) setError(failure.message);
          }),
        ),
      ),
    );
    return () => {
      active.current = false;
    };
  }, []);
  const perform = <T,>(
    task: Effect.Effect<T, { message: string }>,
    receive: (result: T) => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
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
  const receive = (value: Outcome) => {
    setOutcome(value);
    if (value.status === "posted") onPosted();
  };
  return (
    <section
      className="panel customer-transfer"
      aria-labelledby="registered-transfer-title"
      data-customer-scope={bankId}
    >
      <h2 id="registered-transfer-title">Transfer to a branch customer</h2>
      <p>
        Send synthetic INR funds between registered accounts. Both customers can
        verify the entries in their statements.
      </p>
      {!review && !locked && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            perform(
              api<Review>("/customer-transfers/review", {
                recipientId: recipient,
                amount,
              }),
              (value) => {
                setReview(value);
                key.current = crypto.randomUUID();
              },
            );
          }}
        >
          <label htmlFor="registered-recipient">Recipient</label>
          <select
            id="registered-recipient"
            required
            value={recipient}
            disabled={busy}
            onChange={(event) => setRecipient(event.target.value)}
          >
            <option value="">Choose a registered recipient</option>
            {recipients.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.display_name} · {choice.reference} · ending{" "}
                {choice.account_suffix}
              </option>
            ))}
          </select>
          <label htmlFor="registered-amount">Amount in INR</label>
          <input
            id="registered-amount"
            inputMode="decimal"
            required
            pattern="(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?"
            value={amount}
            disabled={busy}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
          />
          <button
            className="primary"
            type="submit"
            disabled={busy || !recipient || !amount}
          >
            Review transfer
          </button>
        </form>
      )}
      {review && (
        <div>
          <h3>Review your transfer</h3>
          <dl className="account-facts">
            <div>
              <dt>From</dt>
              <dd>
                {review.sender_name} · ending {review.sender_suffix}
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>
                {review.recipient_name} · ending {review.recipient_suffix}
              </dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{formatMoney(review.offer.amount_minor / 100)}</dd>
            </div>
          </dl>
          {!locked && (
            <>
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => {
                  // Lock before starting transport. A timeout permits inspection only.
                  setLocked(true);
                  perform(
                    api<Outcome>("/customer-transfers/confirm", {
                      offerId: review.offer.id,
                      key: key.current,
                    }),
                    receive,
                  );
                }}
              >
                Confirm transfer once
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Change transfer
              </button>
            </>
          )}
        </div>
      )}
      {busy && <p role="status">Checking the original banking instruction…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {locked && outcome?.status !== "posted" && (
        <p role="status">
          {outcome?.status === "failed"
            ? "Core declined this original instruction. Its saved outcome is retained."
            : "The original outcome needs inspection. No second transfer will be sent."}
        </p>
      )}
      {outcome?.receipt && (
        <div role="status" className="notice">
          <h3>Transfer completed</h3>
          <p>
            {formatMoney(outcome.receipt.amount_minor / 100)} · Core transfer{" "}
            {outcome.receipt.transfer_id}
          </p>
          <p>
            Sender debit {outcome.receipt.debit_id} · Recipient credit{" "}
            {outcome.receipt.credit_id}
          </p>
          <p>
            Source balance after proof:{" "}
            {formatMoney(outcome.receipt.source_balance_minor / 100)}
          </p>
        </div>
      )}
      {locked && outcome?.status !== "posted" && (
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            perform(
              api<Outcome>(
                "/customer-transfers/inspect",
                outcome
                  ? { commandId: outcome.id }
                  : { offerId: review?.offer.id, key: key.current },
              ),
              receive,
            )
          }
        >
          Inspect original transfer
        </button>
      )}
      {outcome && ["posted", "failed"].includes(outcome.status) && (
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => {
            setReview(null);
            setOutcome(null);
            setLocked(false);
            setAmount("");
          }}
        >
          Start another transfer
        </button>
      )}
    </section>
  );
}
