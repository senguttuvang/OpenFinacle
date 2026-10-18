"use client";

import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { formatMoney, type Role } from "../../banking-workspace/domain/banking";
import type { ServicePerform } from "../../service-requests/ui/service-request-form";
import type {
  LoanApplication,
  LoanDetail,
  LoanQuotePreview,
} from "../domain/origination/loan-workflow";
import type { LoanCommand, LoanTerms } from "../domain/origination/loans";
import {
  LoanPending,
  loanActionLabel,
  loanDetailApi,
  loanListApi,
  loanQuoteApi,
  loanReference,
  loanResponseError,
  loanStatus,
  loanStorageError,
  repeatableLoanDraft,
  unresolvedLoanOriginal,
  verifiedLoanReceipt,
} from "./loan-api";
import { LoanDetailView, loanActionHelp } from "./loan-detail";
import { LoanApplicationForm } from "./loan-terms";

function LoanDecisionForm({
  command,
  busy,
  reviewed,
  review,
  edit,
  change,
  confirm,
  cancel,
}: {
  command: LoanCommand;
  busy: boolean;
  reviewed: boolean;
  review: () => void;
  edit: () => void;
  change: (note: string) => void;
  confirm: () => void;
  cancel: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: !reviewed });
  }, [reviewed]);
  return (
    <form
      className="deposit-form loan-decision"
      onSubmit={(event) => {
        event.preventDefault();
        if (reviewed) confirm();
        else review();
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        {reviewed ? "Review loan instruction" : loanActionLabel[command.action]}
      </h3>
      <p>
        {loanReference(command.id)} · saved version {command.version}
      </p>
      <p>{loanActionHelp[command.action]}</p>
      {reviewed ? (
        <>
          <h4>{loanActionLabel[command.action]}</h4>
          <p className="loan-note">{command.note}</p>
          <p>
            Confirm this original instruction once. If its reply cannot be
            verified, check its saved reference before another decision.
          </p>
        </>
      ) : (
        <>
          <label htmlFor="loan-decision-note">Decision note</label>
          <textarea
            id="loan-decision-note"
            required
            minLength={5}
            maxLength={300}
            value={command.note}
            disabled={busy}
            onChange={(event) => change(event.target.value)}
            aria-describedby="loan-note-help"
          />
          <small id="loan-note-help">
            Record the decision and reason in 5–300 characters. Use invented
            demonstration details.
          </small>
        </>
      )}
      <div className="form-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy
            ? "Recording original instruction…"
            : reviewed
              ? `Confirm ${loanActionLabel[command.action].toLowerCase()}`
              : "Review loan instruction"}
        </button>
        {reviewed && (
          <button type="button" disabled={busy} onClick={edit}>
            Edit decision note
          </button>
        )}
        <button type="button" disabled={busy} onClick={cancel}>
          Leave loan instruction
        </button>
      </div>
    </form>
  );
}

export function LoanWorkspace({
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
  const storage = `openfinacle:loan-command:${bankId}`;
  const [loans, setLoans] = useState<readonly LoanApplication[] | null>(null);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [pending, setPending] = useState<LoanPending | null>(null);
  const [missing, setMissing] = useState(false);
  const [newApplication, setNewApplication] = useState(false);
  const [quote, setQuote] = useState<LoanQuotePreview | null>(null);
  const [action, setAction] = useState<LoanCommand | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const detailId = detail?.loan.id;
  useEffect(() => {
    if (detailId) heading.current?.focus({ preventScroll: false });
  }, [detailId]);
  const performHere = (
    task: Effect.Effect<unknown, { message: string }>,
    refresh = false,
  ) =>
    perform(
      task.pipe(
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            setError(failure.message);
            if (failure.message === loanStorageError().message)
              setStorageBlocked(true);
          }),
        ),
      ),
      "",
      refresh,
    );
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly revalidates the same saved resource without adding a query or Core read.
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Effect.runPromise(
      Effect.gen(function* () {
        const stored = yield* Effect.try({
          try: () => sessionStorage.getItem(storage),
          catch: loanStorageError,
        });
        const original = stored
          ? yield* Schema.decodeUnknown(Schema.parseJson(LoanPending), {
              onExcessProperty: "error",
            })(stored).pipe(Effect.mapError(loanStorageError))
          : null;
        if (active) {
          setPending(original);
          setStorageBlocked(false);
        }
        const list = yield* loanListApi(bankId);
        if (active) {
          setLoans(list);
          setLoading(false);
        }
      }).pipe(
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active) {
              setLoading(false);
              setError(failure.message);
              if (failure.message === loanStorageError().message)
                setStorageBlocked(true);
            }
          }),
        ),
      ),
    );
    return () => {
      active = false;
    };
  }, [bankId, storage, revision]);
  const removePending = Effect.try({
    try: () => sessionStorage.removeItem(storage),
    catch: loanStorageError,
  });
  const receive = (result: LoanDetail, original: LoanPending) =>
    Effect.gen(function* () {
      if (!verifiedLoanReceipt(result, original))
        return yield* Effect.fail(loanResponseError());
      yield* Effect.sync(() => {
        setDetail(result);
        setAction(null);
        setReviewed(false);
        setNewApplication(false);
        setQuote(null);
        setMissing(false);
        setError("");
      });
      if (unresolvedLoanOriginal(result)) {
        yield* Effect.sync(() =>
          setNotice(
            "The original Core outcome is unconfirmed. Its reference is saved; ask an approver to inspect it. Do not send it again.",
          ),
        );
        return;
      }
      yield* removePending;
      yield* Effect.sync(() => {
        setPending(null);
        setRevision((value) => value + 1);
        setNotice(
          result.recorded_operation?.status === "failed"
            ? "Core definitely rejected this original attempt. Review its saved outcome before any new attempt."
            : "Loan instruction recorded. The saved status and history are shown below.",
        );
      });
    });
  const send = (original: LoanPending) =>
    performHere(
      Effect.gen(function* () {
        yield* Effect.try({
          try: () => sessionStorage.setItem(storage, JSON.stringify(original)),
          catch: loanStorageError,
        });
        yield* Effect.sync(() => {
          setPending(original);
          setMissing(false);
          setError("");
          setNotice("");
        });
        const result = yield* loanDetailApi(
          bankId,
          original.instruction.kind === "submit" ? "/loans" : "/loans/action",
          original.instruction.input,
          original.key,
        ).pipe(
          Effect.catchAll((failure) =>
            Effect.gen(function* () {
              // A verified explicit pre-dispatch 4xx rejection is distinct from a lost or unreadable reply.
              if (
                failure.status >= 400 &&
                failure.status < 500 &&
                failure.uncertain === false
              ) {
                yield* removePending;
                yield* Effect.sync(() => {
                  setPending(null);
                  setRevision((value) => value + 1);
                  setAction(null);
                  setReviewed(false);
                  setDetail(null);
                });
                if (original.instruction.kind === "action") {
                  const current = yield* Effect.either(
                    loanDetailApi(
                      bankId,
                      `/loans?id=${encodeURIComponent(original.instruction.input.id)}`,
                    ),
                  );
                  if (
                    current._tag === "Right" &&
                    current.right.loan.id === original.instruction.input.id
                  )
                    yield* Effect.sync(() => setDetail(current.right));
                }
              }
              return yield* Effect.fail(failure);
            }),
          ),
        );
        yield* receive(result, original);
      }),
      true,
    );
  const recover = () => {
    if (!pending) return;
    const original = pending;
    performHere(
      loanDetailApi(
        bankId,
        `/loans?key=${encodeURIComponent(original.key)}`,
      ).pipe(
        Effect.flatMap((result) => receive(result, original)),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            setError(
              failure.status === 404
                ? "No saved receipt is visible yet. Absence does not prove that a Core write was never sent. Keep this original reference and check again."
                : failure.message,
            );
            setMissing(failure.status === 404);
          }),
        ),
      ),
      true,
    );
  };
  const select = (id: string) =>
    performHere(
      loanDetailApi(bankId, `/loans?id=${encodeURIComponent(id)}`).pipe(
        Effect.flatMap((result) =>
          result.loan.id === id
            ? Effect.succeed(result)
            : Effect.fail(loanResponseError()),
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            setDetail(result);
            setAction(null);
            setReviewed(false);
            setNewApplication(false);
            setQuote(null);
            setNotice("");
            setError("");
          }),
        ),
      ),
    );
  const inspect = () => {
    if (!detail) return;
    performHere(
      loanDetailApi(bankId, "/loans/inspect", { id: detail.loan.id }).pipe(
        Effect.filterOrFail(
          (result) => result.loan.id === detail.loan.id,
          loanResponseError,
        ),
        Effect.flatMap((result) =>
          pending
            ? receive(result, pending)
            : Effect.sync(() => {
                setDetail(result);
                setNotice(
                  result.operation?.status === "confirmed"
                    ? "The original outcome is confirmed from Core proof."
                    : "The original outcome remains unconfirmed. No instruction was replayed.",
                );
                setRevision((value) => value + 1);
              }),
        ),
      ),
      true,
    );
  };
  const refresh = () => {
    if (!detail) return;
    performHere(
      loanDetailApi(bankId, "/loans/refresh", { id: detail.loan.id }).pipe(
        Effect.filterOrFail(
          (result) => result.loan.id === detail.loan.id,
          loanResponseError,
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            setDetail(result);
            setNotice(
              result.core?.stale
                ? "Core could not be refreshed. The last observation remains marked stale."
                : "Core observation refreshed. Workflow decisions are unchanged.",
            );
          }),
        ),
      ),
    );
  };
  const requestQuote = (terms: LoanTerms) =>
    performHere(
      loanQuoteApi(bankId, terms).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            setQuote(result);
            setError("");
            setNotice("");
          }),
        ),
      ),
    );
  const locked =
    busy || loading || pending !== null || storageBlocked || loans === null;
  const unfunded = loans?.some((loan) =>
    ["submitted", "recommended", "registered", "approved"].includes(
      loan.status,
    ),
  );
  return (
    <section
      className="panel card-workspace deposit-workspace loan-workspace"
      aria-busy={busy || loading}
    >
      <div className="panel-heading">
        <div>
          <h2>{role === "customer" ? "My loans" : "Customer lending"}</h2>
          <p>
            Core personal loans · saved applications, decisions and holdings
          </p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setRevision((value) => value + 1);
            if (detail) select(detail.loan.id);
          }}
        >
          Refresh saved loan status
        </button>
      </div>
      {error && (
        <p role="alert" className="loan-warning">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading saved loan applications…</p>}
      {storageBlocked && (
        <p role="status">
          Loan instructions are blocked until this browser can read and store
          the original reference. Restore storage, then refresh saved status.
        </p>
      )}
      {pending && (
        <section
          className="loan-warning"
          aria-label="Original loan instruction"
        >
          <h3>Check original loan instruction</h3>
          <p>
            {pending.instruction.kind === "submit"
              ? "Application submission"
              : loanActionLabel[pending.instruction.input.action]}{" "}
            · {pending.role}
          </p>
          <p className="loan-reference">{pending.key}</p>
          <p>
            Its original input remains saved on this device. Check the receipt
            before another decision.
          </p>
          <div className="form-actions">
            <button type="button" disabled={busy} onClick={recover}>
              Check saved original status
            </button>
            {missing &&
              repeatableLoanDraft(pending) &&
              pending.role === role && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(pending)}
                  >
                    Send same nonfinancial instruction
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      performHere(
                        removePending.pipe(
                          Effect.tap(() =>
                            Effect.sync(() => {
                              setPending(null);
                              setMissing(false);
                              setAction(null);
                              setNewApplication(false);
                              setRevision((value) => value + 1);
                            }),
                          ),
                        ),
                      )
                    }
                  >
                    Leave local nonfinancial draft
                  </button>
                </>
              )}
          </div>
          {missing && !repeatableLoanDraft(pending) && (
            <p>
              Core instructions are never resent or discarded because a receipt
              is absent. Keep checking the original reference.
            </p>
          )}
        </section>
      )}
      {!accountOpened ? (
        <div className="empty-state">
          <h3>Open your savings account first</h3>
          <p>
            Loans use this relationship’s owned savings account. No account is
            created during this visit.
          </p>
          <button type="button" disabled={busy} onClick={openAccount}>
            Go to account opening
          </button>
        </div>
      ) : (
        <>
          {role === "customer" && !newApplication && (
            <div className="form-actions">
              <button
                type="button"
                className="primary"
                disabled={locked || unfunded}
                onClick={() => {
                  setNewApplication(true);
                  setDetail(null);
                  setQuote(null);
                  setAction(null);
                  setError("");
                  setNotice("");
                }}
              >
                Apply for a personal loan
              </button>
              {unfunded && (
                <p>
                  Complete or withdraw the current unfunded application before
                  starting another.
                </p>
              )}
            </div>
          )}
          {newApplication && role === "customer" && (
            <LoanApplicationForm
              busy={busy}
              quote={quote}
              requestQuote={requestQuote}
              pending={pending !== null || storageBlocked}
              submit={() => {
                if (quote)
                  send({
                    key: crypto.randomUUID(),
                    role,
                    instruction: {
                      kind: "submit",
                      input: { quote_id: quote.quote.id, consent: true },
                    },
                  });
              }}
              cancel={() => {
                setNewApplication(false);
                setQuote(null);
              }}
            />
          )}
          {loans?.length === 0 && !loading && (
            <div className="empty-state">
              <h3>No loan applications yet</h3>
              <p>
                {role === "customer"
                  ? "Review a Core quote and its repayment schedule before deciding to apply."
                  : "Customer applications and saved Core holdings will appear here. Officers assess; approvers authorize independently."}
              </p>
            </div>
          )}
          {loans !== null && loans.length > 0 && (
            <ol className="loan-list" aria-label="Loan applications">
              {loans.map((loan) => (
                <li key={loan.id}>
                  <div>
                    <strong>{loanReference(loan.id)}</strong>
                    <p>
                      {formatMoney(loan.terms.principal)} · {loan.terms.months}{" "}
                      months · {loanStatus(loan.status)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || loading || pending !== null}
                    onClick={() => select(loan.id)}
                    aria-label={`View loan ${loanReference(loan.id)}`}
                  >
                    View loan
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {detail && (
        <section className="loan-detail" aria-label="Loan details">
          <h3 ref={heading} tabIndex={-1}>
            Loan details
          </h3>
          <LoanDetailView
            detail={detail}
            role={role}
            busy={busy}
            locked={locked || action !== null}
            choose={(decision) => {
              setAction({
                id: detail.loan.id,
                version: detail.loan.version,
                action: decision,
                note: "",
              });
              setReviewed(false);
              setError("");
              setNotice("");
            }}
            inspect={inspect}
            refresh={refresh}
          />
          {action && (
            <LoanDecisionForm
              command={action}
              busy={locked}
              reviewed={reviewed}
              review={() => setReviewed(true)}
              edit={() => setReviewed(false)}
              change={(note) => setAction({ ...action, note })}
              confirm={() =>
                send({
                  key: crypto.randomUUID(),
                  role,
                  instruction: {
                    kind: "action",
                    input: { ...action, note: action.note.trim() },
                  },
                })
              }
              cancel={() => {
                setAction(null);
                setReviewed(false);
              }}
            />
          )}
        </section>
      )}
    </section>
  );
}
