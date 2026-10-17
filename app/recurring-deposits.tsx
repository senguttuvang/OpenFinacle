"use client";

import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { BankingError, formatMoney, type Role } from "../src/domain/banking";
import {
  RecurringCommand,
  RecurringDetail,
  RecurringPlan,
  RecurringTerms,
} from "../src/domain/recurring-deposits";
import { api } from "./api";
import { RecurringHolding, recurringStatus } from "./recurring-holding";
import { RecurringForm, recurringAction } from "./recurring-terms";
import type { ServicePerform } from "./service-request-form";

const Pending = Schema.Struct({
  key: Schema.String,
  role: Schema.Literal("customer", "officer", "approver"),
  instruction: Schema.Union(
    Schema.Struct({ kind: Schema.Literal("submit"), input: RecurringTerms }),
    Schema.Struct({ kind: Schema.Literal("action"), input: RecurringCommand }),
  ),
});
type Pending = typeof Pending.Type;
const storageError = () =>
  new BankingError({
    message:
      "The pending recurring instruction could not be stored or read. Restore browser storage before sending another instruction.",
    status: 503,
  });
const invalid = () =>
  new BankingError({
    message:
      "Recurring response could not be verified. Inspect the saved instruction before retrying.",
    status: 503,
  });
const detailApi = (
  bankId: string,
  path: string,
  body?: unknown,
  key?: string,
) =>
  api<unknown>(path, body, key).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknown(RecurringDetail)(value).pipe(
        Effect.mapError(invalid),
      ),
    ),
    Effect.flatMap((result) =>
      result.plan.bank_id === bankId
        ? Effect.succeed(result)
        : Effect.fail(invalid()),
    ),
  );

export function RecurringDeposits({
  bankId,
  role,
  busy,
  perform,
  accountOpened,
  openAccount,
}: {
  bankId: string;
  role: Role;
  busy: boolean;
  perform: ServicePerform;
  accountOpened: boolean;
  openAccount: () => void;
}) {
  const storage = `openfinacle:recurring-command:${bankId}`;
  const [plans, setPlans] = useState<readonly RecurringPlan[] | null>(null);
  const [detail, setDetail] = useState<RecurringDetail | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [retry, setRetry] = useState(false);
  const [newApplication, setNewApplication] = useState(false);
  const [action, setAction] = useState<RecurringCommand | null>(null);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const title = useRef<HTMLHeadingElement>(null);
  const focusTarget = action ? action.action : detail?.plan.id;
  useEffect(() => {
    if (focusTarget) title.current?.focus({ preventScroll: !review });
  }, [focusTarget, review]);
  const performHere = (task: Effect.Effect<unknown, { message: string }>) =>
    perform(
      task.pipe(
        Effect.catchAll((failure) =>
          Effect.sync(() => setError(failure.message)),
        ),
      ),
      "",
      false,
    );
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Effect.runPromise(
      Effect.gen(function* () {
        const saved = yield* Effect.try({
          try: () => sessionStorage.getItem(storage),
          catch: storageError,
        });
        const restored = saved
          ? yield* Schema.decodeUnknown(Schema.parseJson(Pending))(saved).pipe(
              Effect.mapError(storageError),
            )
          : null;
        if (active) setPending(restored);
        const result = yield* api<unknown>(
          `/recurring-deposits?refresh=${revision}`,
        ).pipe(
          Effect.flatMap((value) =>
            Schema.decodeUnknown(
              Schema.Struct({ plans: Schema.Array(RecurringPlan) }),
            )(value).pipe(Effect.mapError(invalid)),
          ),
        );
        if (result.plans.some((plan) => plan.bank_id !== bankId))
          return yield* Effect.fail(invalid());
        if (active) {
          setPlans(result.plans);
          setError("");
          setLoading(false);
        }
      }).pipe(
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active) {
              setError(failure.message);
              setLoading(false);
            }
          }),
        ),
      ),
    );
    return () => {
      active = false;
    };
  }, [bankId, storage, revision]);
  const accept = (result: RecurringDetail) =>
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => sessionStorage.removeItem(storage),
        catch: storageError,
      });
      yield* Effect.sync(() => {
        setDetail(result);
        setPending(null);
        setAction(null);
        setReview(false);
        setNewApplication(false);
        setRetry(false);
        setError("");
        setNotice(
          "Recurring instruction recorded. The saved plan and history are shown below.",
        );
        setRevision((value) => value + 1);
      });
    });
  const verified = (result: RecurringDetail, command: Pending) =>
    result.confirmed_key === command.key &&
    (command.instruction.kind === "submit" ||
      result.plan.id === command.instruction.input.id);
  const send = (command: Pending) =>
    performHere(
      Effect.gen(function* () {
        yield* Effect.try({
          try: () => sessionStorage.setItem(storage, JSON.stringify(command)),
          catch: storageError,
        });
        yield* Effect.sync(() => {
          setPending(command);
          setRetry(false);
          setError("");
          setNotice("");
        });
        const result = yield* detailApi(
          bankId,
          command.instruction.kind === "submit"
            ? "/recurring-deposits"
            : "/recurring-deposits/action",
          command.instruction.input,
          command.key,
        );
        if (!verified(result, command)) return yield* Effect.fail(invalid());
        yield* accept(result);
      }),
    );
  const inspect = () => {
    if (!pending) return;
    performHere(
      detailApi(
        bankId,
        `/recurring-deposits?key=${encodeURIComponent(pending.key)}`,
      ).pipe(
        Effect.flatMap((result) =>
          verified(result, pending) ? accept(result) : Effect.fail(invalid()),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            setError(failure.message);
            setRetry(failure.status === 404);
          }),
        ),
      ),
    );
  };
  const discard = () =>
    performHere(
      Effect.try({
        try: () => sessionStorage.removeItem(storage),
        catch: storageError,
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setPending(null);
            setRetry(false);
            setAction(null);
            setNewApplication(false);
            setRevision((value) => value + 1);
          }),
        ),
      ),
    );
  const select = (id: string) =>
    performHere(
      detailApi(
        bankId,
        `/recurring-deposits?id=${encodeURIComponent(id)}`,
      ).pipe(
        Effect.flatMap((result) =>
          result.plan.id === id
            ? Effect.succeed(result)
            : Effect.fail(invalid()),
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            setDetail(result);
            setAction(null);
            setReview(false);
            setNewApplication(false);
            setError("");
            setNotice("");
          }),
        ),
      ),
    );
  const locked = busy || loading || pending !== null || plans === null;
  return (
    <section
      className="panel card-workspace deposit-workspace recurring-workspace"
      aria-busy={busy || loading}
    >
      <div className="panel-heading">
        <div>
          <h2>
            {role === "customer"
              ? "My recurring deposits"
              : "Customer recurring deposits"}
          </h2>
          <p>Explicit demo allocations · no savings mandate or debit</p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setRevision((value) => value + 1);
            setAction(null);
            setReview(false);
            setDetail(null);
          }}
        >
          Refresh recurring plans
        </button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <div className="card-recovery">
          <h3>Check your saved recurring instruction</h3>
          <p>
            Its outcome is not confirmed. Inspect the reference before starting
            another instruction.
          </p>
          <code>{pending.key}</code>
          <div className="card-actions">
            <button type="button" disabled={busy || loading} onClick={inspect}>
              Check saved recurring instruction
            </button>
            {retry && pending.role === role && (
              <>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => send(pending)}
                >
                  Retry original recurring instruction
                </button>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={discard}
                >
                  Discard unrecorded recurring instruction
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {plans === null && !error && (
        <p role="status">Loading saved recurring plans…</p>
      )}
      {role === "customer" && !accountOpened && (
        <div className="empty-state">
          <h3>Open an account before starting a recurring plan</h3>
          <p>
            Open the relationship's account first. Demo allocations do not use
            its balance.
          </p>
          <button type="button" disabled={busy} onClick={openAccount}>
            Account opening
          </button>
        </div>
      )}
      {role === "customer" && accountOpened && !newApplication && (
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            setNewApplication(true);
            setAction(null);
            setDetail(null);
            setNotice("");
          }}
        >
          Open a demo recurring deposit
        </button>
      )}
      {newApplication && (
        <RecurringForm
          disabled={locked}
          cancel={() => setNewApplication(false)}
          submit={(input) =>
            send({
              key: crypto.randomUUID(),
              role,
              instruction: { kind: "submit", input },
            })
          }
        />
      )}
      {plans?.length === 0 &&
        !newApplication &&
        (role !== "customer" || accountOpened) && (
          <div className="empty-state">
            <h3>No recurring applications or plans</h3>
            <p>
              Submitted applications and approved recurring plans will appear
              here.
            </p>
          </div>
        )}
      {!!plans?.length && (
        <ul className="deposit-list">
          {plans.map((plan) => (
            <li key={plan.id}>
              <div>
                <strong>
                  {plan.terms.label || "Recurring plan"} ·{" "}
                  {formatMoney(plan.terms.amount)} monthly
                </strong>
                <span>
                  {recurringStatus[plan.status]} · {plan.allocated_count} of{" "}
                  {plan.terms.months} installments recorded
                </span>
                <small>RD-{plan.id.slice(0, 8).toUpperCase()}</small>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => select(plan.id)}
              >
                View RD-{plan.id.slice(0, 8).toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <RecurringHolding detail={detail} titleRef={action ? undefined : title}>
          {!action && (
            <div className="card-actions">
              {detail.actions.map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={locked}
                  onClick={() => {
                    const period = detail.installments.find(
                      (item) => item.state !== "allocated",
                    )?.period;
                    setAction({
                      id: detail.plan.id,
                      version: detail.plan.version,
                      action: value,
                      note:
                        value === "allocate"
                          ? `Demo allocation for installment ${period}; no savings debit.`
                          : "",
                      ...(value === "allocate" && period !== undefined
                        ? { period }
                        : {}),
                    });
                    setReview(false);
                  }}
                >
                  {recurringAction[value]}
                </button>
              ))}
            </div>
          )}
          {action && (
            <form
              className="deposit-form"
              onSubmit={(event) => {
                event.preventDefault();
                setReview(true);
              }}
            >
              <h3 ref={title} tabIndex={-1}>
                {review
                  ? "Review recurring instruction"
                  : recurringAction[action.action]}
              </h3>
              {action.period !== undefined && (
                <p>
                  Installment {action.period} ·{" "}
                  {formatMoney(detail.plan.terms.amount)}. This records a demo
                  allocation only; your savings account stays unchanged.
                </p>
              )}
              <label>
                Instruction reason
                <textarea
                  required
                  minLength={5}
                  maxLength={300}
                  disabled={locked || review}
                  value={action.note}
                  onChange={(event) =>
                    setAction({ ...action, note: event.target.value })
                  }
                />
              </label>
              {review && (
                <p>
                  {recurringAction[action.action]} for this synthetic product.{" "}
                  {action.action === "activate"
                    ? "This creates the plan and its schedule without allocating any installment automatically."
                    : action.action === "allocate"
                      ? "No real payment, debit or settlement will occur."
                      : "Review the decision and reason before confirming. Rejection and cancellation cannot be undone."}
                </p>
              )}
              <div className="card-actions">
                {review ? (
                  <>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setReview(false)}
                    >
                      Edit recurring instruction
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        send({
                          key: crypto.randomUUID(),
                          role,
                          instruction: { kind: "action", input: action },
                        })
                      }
                    >
                      Confirm {recurringAction[action.action].toLowerCase()}
                    </button>
                  </>
                ) : (
                  <button type="submit" disabled={locked}>
                    Review recurring instruction
                  </button>
                )}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setAction(null)}
                >
                  Leave recurring instruction
                </button>
              </div>
            </form>
          )}
        </RecurringHolding>
      )}
    </section>
  );
}
