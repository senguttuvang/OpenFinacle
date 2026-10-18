"use client";

import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import { BankingError, bankingDate, formatMoney } from "../src/domain/banking";
import type {
  CustomerChoice,
  TransferReceipt,
} from "../src/domain/customer-registry";
import { api } from "./api";
import {
  type CustomerTransferPending,
  type CustomerTransferReview,
  customerTransferHistoryApi,
  customerTransferOutcome,
  customerTransferReviewApi,
  loadCustomerTransferPending,
  saveCustomerTransferPending,
} from "./customer-transfer-api";

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
  const [review, setReview] = useState<CustomerTransferReview | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const original = useRef<CustomerTransferPending | null>(null);
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
      Effect.gen(function* () {
        const retained = yield* loadCustomerTransferPending(bankId);
        if (!active.current) return yield* Effect.interrupt;
        if (retained) {
          original.current = retained;
          key.current = retained.key;
          setReview(retained.review);
          setLocked(true);
        }
        return yield* customerTransferHistoryApi();
      }).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            const unresolved = value.transfers.find((row) =>
              ["executing", "uncertain", "pending"].includes(row.status),
            );
            if (active.current && unresolved && !original.current) {
              setLocked(true);
              setOutcome({ ...unresolved, receipt: null });
            }
            if (active.current) setHistoryReady(true);
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
  }, [bankId]);
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
    if (["posted", "failed"].includes(value.status)) {
      original.current = null;
      setHistoryReady(true);
    }
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
      {!historyReady && (
        <p role="status">
          Checking saved original transfer references. Reload if this check
          cannot complete.
        </p>
      )}
      {!review && !locked && historyReady && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            perform(
              customerTransferReviewApi(bankId, recipient, amount),
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
                  perform(
                    Effect.gen(function* () {
                      if (
                        Date.now() > review.offer.expires_at ||
                        bankingDate(Date.now()) !== review.offer.payment_date
                      )
                        return yield* Effect.fail(
                          new BankingError({
                            message:
                              "This transfer review expired. Change the transfer and review current funds again.",
                            status: 409,
                          }),
                        );
                      const pending: CustomerTransferPending = {
                        schema: 1,
                        bank_id: bankId,
                        key: key.current,
                        review,
                      };
                      yield* saveCustomerTransferPending(pending);
                      yield* Effect.sync(() => {
                        original.current = pending;
                        setLocked(true);
                      });
                      const value = yield* api<unknown>(
                        "/customer-transfers/confirm",
                        { offerId: review.offer.id, key: pending.key },
                      );
                      return yield* customerTransferOutcome(
                        value,
                        bankId,
                        pending,
                      );
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
            ? "This original instruction was declined. Its saved outcome is retained."
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
              api<unknown>(
                "/customer-transfers/inspect",
                outcome
                  ? { commandId: outcome.id }
                  : { offerId: review?.offer.id, key: key.current },
              ).pipe(
                Effect.flatMap((value) =>
                  customerTransferOutcome(
                    value,
                    bankId,
                    original.current,
                    outcome?.id,
                  ),
                ),
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
