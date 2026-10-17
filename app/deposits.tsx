"use client";

import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { BankingError, formatMoney, type Role } from "../src/domain/banking";
import {
  Deposit,
  DepositCommand,
  DepositDetail,
  DepositTerms,
} from "../src/domain/deposits";
import { api } from "./api";
import { DepositAdvicePreview } from "./deposit-advice";
import {
  DepositFacts,
  DepositForm,
  depositAction,
  depositStatus,
} from "./deposit-terms";
import type { ServicePerform } from "./service-request-form";

const Pending = Schema.Struct({
  key: Schema.String,
  role: Schema.Literal("customer", "officer", "approver"),
  instruction: Schema.Union(
    Schema.Struct({ kind: Schema.Literal("submit"), input: DepositTerms }),
    Schema.Struct({ kind: Schema.Literal("action"), input: DepositCommand }),
  ),
});
type Pending = typeof Pending.Type;
const storageError = () =>
  new BankingError({
    message:
      "The pending deposit instruction could not be stored or read. Restore browser storage before sending another instruction.",
    status: 503,
  });
const invalid = () =>
  new BankingError({
    message:
      "Deposit response could not be verified. Inspect the saved instruction before retrying.",
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
      Schema.decodeUnknown(DepositDetail)(value).pipe(Effect.mapError(invalid)),
    ),
    Effect.flatMap((result) =>
      result.deposit.bank_id === bankId
        ? Effect.succeed(result)
        : Effect.fail(invalid()),
    ),
  );

export function Deposits({
  bankId,
  role,
  busy,
  perform,
}: {
  bankId: string;
  role: Role;
  busy: boolean;
  perform: ServicePerform;
}) {
  const storage = `openfinacle:deposit-command:${bankId}`;
  const [deposits, setDeposits] = useState<readonly Deposit[] | null>(null);
  const [detail, setDetail] = useState<DepositDetail | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [retry, setRetry] = useState(false);
  const [newApplication, setNewApplication] = useState(false);
  const [action, setAction] = useState<DepositCommand | null>(null);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const title = useRef<HTMLHeadingElement>(null);
  const focusTarget = action ? action.action : detail?.deposit.id;
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
          `/deposits?refresh=${revision}`,
        ).pipe(
          Effect.flatMap(
            Schema.decodeUnknown(
              Schema.Struct({ deposits: Schema.Array(Deposit) }),
            ),
          ),
          Effect.mapError(invalid),
        );
        if (result.deposits.some((deposit) => deposit.bank_id !== bankId))
          return yield* Effect.fail(invalid());
        if (active) {
          setDeposits(result.deposits);
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
  }, [storage, bankId, revision]);
  const accept = (result: DepositDetail) =>
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
          "Deposit instruction recorded. The saved product and history are shown below.",
        );
        setRevision((value) => value + 1);
      });
    });
  const verified = (result: DepositDetail, command: Pending) =>
    result.confirmed_key === command.key &&
    (command.instruction.kind === "submit" ||
      result.deposit.id === command.instruction.input.id);
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
            ? "/deposits"
            : "/deposits/action",
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
        `/deposits?key=${encodeURIComponent(pending.key)}`,
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
  const select = (id: string) =>
    performHere(
      detailApi(bankId, `/deposits?id=${encodeURIComponent(id)}`).pipe(
        Effect.flatMap((result) =>
          result.deposit.id === id
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
  const locked = busy || loading || pending !== null || deposits === null;
  return (
    <section
      className="panel card-workspace deposit-workspace"
      aria-busy={busy || loading}
    >
      <div className="panel-heading">
        <div>
          <h2>
            {role === "customer"
              ? "My fixed deposits"
              : "Customer fixed deposits"}
          </h2>
          <p>Persistent synthetic products · no savings debit or settlement</p>
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
          Refresh deposits
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
          <h3>Check your saved deposit instruction</h3>
          <p>
            Its outcome is not confirmed. Inspect the reference before starting
            another instruction.
          </p>
          <code>{pending.key}</code>
          <div className="card-actions">
            <button type="button" disabled={busy || loading} onClick={inspect}>
              Check saved instruction
            </button>
            {retry && pending.role === role && (
              <>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => send(pending)}
                >
                  Retry original instruction
                </button>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() =>
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
                    )
                  }
                >
                  Discard unrecorded instruction
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {deposits === null && !error && (
        <p role="status">Loading saved deposits…</p>
      )}
      {role === "customer" && !newApplication && (
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
          Open a demo fixed deposit
        </button>
      )}
      {newApplication && (
        <DepositForm
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
      {deposits?.length === 0 && !newApplication && (
        <div className="empty-state">
          <h3>No fixed-deposit applications or holdings</h3>
          <p>
            Submitted applications and approved demo holdings will appear here.
          </p>
        </div>
      )}
      {!!deposits?.length && (
        <ul className="deposit-list">
          {deposits.map((deposit) => (
            <li key={deposit.id}>
              <div>
                <strong>
                  {formatMoney(deposit.terms.amount)} · {deposit.terms.months}{" "}
                  months
                </strong>
                <span>{depositStatus[deposit.status]}</span>
                <small>FD-{deposit.id.slice(0, 8).toUpperCase()}</small>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => select(deposit.id)}
              >
                View FD-{deposit.id.slice(0, 8).toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <div className="deposit-detail">
          <h3 ref={action ? undefined : title} tabIndex={-1}>
            FD-{detail.deposit.id.slice(0, 8).toUpperCase()} ·{" "}
            {depositStatus[detail.deposit.status]}
          </h3>
          <p>Demo allocation only. Your savings account is unchanged.</p>
          <DepositFacts terms={detail.deposit.terms} />
          {detail.deposit.status === "active" && (
            <dl className="detail-grid">
              <div>
                <dt>Activated</dt>
                <dd>{detail.deposit.activated_at}</dd>
              </div>
              <div>
                <dt>Maturity date</dt>
                <dd>{detail.deposit.maturity_date}</dd>
              </div>
              <div>
                <dt>Saved maturity illustration</dt>
                <dd>
                  {detail.deposit.maturity_minor === null
                    ? "Unavailable"
                    : formatMoney(detail.deposit.maturity_minor / 100)}
                </dd>
              </div>
            </dl>
          )}
          {detail.deposit.status === "active" && (
            <DepositAdvicePreview
              key={detail.deposit.id}
              bankId={bankId}
              id={detail.deposit.id}
              kind="fixed"
              busy={busy}
            />
          )}
          {!action && (
            <div className="card-actions">
              {detail.actions.map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={locked}
                  onClick={() => {
                    setAction({
                      id: detail.deposit.id,
                      version: detail.deposit.version,
                      action: value,
                      note: "",
                    });
                    setReview(false);
                  }}
                >
                  {depositAction[value]}
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
                  ? "Review deposit instruction"
                  : depositAction[action.action]}
              </h3>
              <label>
                Decision reason
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
                  {depositAction[action.action]} for this demo product.{" "}
                  {action.action === "activate"
                    ? "This creates an active synthetic holding; savings and settlement are unchanged."
                    : "Review your decision and reason before confirming."}
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
                      Edit instruction
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
                      Confirm {depositAction[action.action].toLowerCase()}
                    </button>
                  </>
                ) : (
                  <button type="submit" disabled={locked}>
                    Review instruction
                  </button>
                )}
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setAction(null)}
                >
                  Leave instruction
                </button>
              </div>
            </form>
          )}
          <h3>Deposit history</h3>
          <ol className="card-history">
            {detail.history.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.action === "submit"
                    ? "Application submitted"
                    : depositAction[event.action as keyof typeof depositAction]}
                </strong>
                <span>
                  {event.actor} · {depositStatus[event.status]} · Version{" "}
                  {event.version}
                </span>
                <p>{event.note}</p>
                <small>{event.created_at}</small>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
