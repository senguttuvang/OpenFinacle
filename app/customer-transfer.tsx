"use client";

import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import { BankingError, bankingDate, formatMoney } from "../src/domain/banking";
import type { TransferReceipt } from "../src/domain/customer-registry";
import { api } from "./api";
import { type PayeeList, payeeListApi } from "./customer-payee-api";
import { CustomerPayees } from "./customer-payees";
import {
  type CustomerTransferPending,
  type CustomerTransferReview,
  customerTransferHistoryApi,
  customerTransferOutcome,
  customerTransferReviewApi,
  loadCustomerTransferPending,
  saveCustomerTransferPending,
} from "./customer-transfer-api";
import { FormSelect } from "./form-select";

interface Outcome {
  id: string;
  status: string;
  receipt: TransferReceipt | null;
  message?: string;
}
export function CustomerTransfer({
  bankId,
  onPosted,
  onPayeesChanged,
}: {
  bankId: string;
  onPosted: () => void;
  onPayeesChanged?: () => void;
}) {
  const [payees, setPayees] = useState<PayeeList | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<CustomerTransferReview | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const original = useRef<CustomerTransferPending | null>(null);
  const key = useRef("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    void Effect.runPromise(
      payeeListApi().pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            if (active.current) setPayees(value);
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
    message = "Checking transfer details…",
  ) => {
    if (busy) return;
    setBusyMessage(message);
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
      <h2 id="registered-transfer-title">Transfer to a saved payee</h2>
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
      {!review && !locked && payees && (
        <CustomerPayees
          payees={payees}
          onChanged={(value) => {
            setPayees(value);
            setRecipient("");
            onPayeesChanged?.();
          }}
        />
      )}
      {!review && !locked && historyReady && payees && (
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
          <FormSelect
            id="registered-recipient"
            required
            value={recipient}
            disabled={busy || payees.count === 0}
            onValueChange={setRecipient}
            placeholder="Choose a saved payee"
            options={payees.payees.map((choice) => ({
              value: choice.recipient_id,
              label: `${choice.display_name} · ending ${choice.account_suffix}`,
            }))}
          />
          {payees.count === 0 && (
            <p>
              Add a known account in Manage saved payees before reviewing a
              transfer.
            </p>
          )}
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
                    "Sending your transfer once and verifying both accounts…",
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
      {busy && <p role="status">{busyMessage}</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {locked && !busy && outcome?.status !== "posted" && (
        <p role="status">
          {outcome?.status === "failed"
            ? (outcome.message ??
              "This original instruction was declined. Its saved outcome is retained.")
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
              "Checking the original banking instruction…",
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
            perform(payeeListApi(), (value) => {
              setPayees(value);
              setReview(null);
              setOutcome(null);
              setLocked(false);
              setRecipient("");
              onPayeesChanged?.();
              setAmount("");
            });
          }}
        >
          Start another transfer
        </button>
      )}
    </section>
  );
}
