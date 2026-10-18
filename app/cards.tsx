"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { BankingError, formatMoney, type Role } from "../src/domain/banking";
import { Card, CardCommand, CardDetail } from "../src/domain/cards";
import { api } from "./api";
import { FormSelect } from "./form-select";
import type { ServicePerform } from "./service-request-form";

const labels = {
  settings: "Change controls",
  hold: "Temporarily hold",
  resume: "Resume card",
  block: "Permanently block",
  activate: "Demo replacement activated",
};
const channels = {
  atm: "ATM withdrawals",
  pos: "Point of sale",
  online: "Online payments",
  contactless: "Contactless payments",
  international: "International usage",
} as const;
const pendingSchema = Schema.Struct({
  key: Schema.String,
  role: Schema.Literal("customer", "officer", "approver"),
  input: CardCommand,
});
type Pending = typeof pendingSchema.Type;
const detailApi = (
  bankId: string,
  path: string,
  body?: unknown,
  key?: string,
) =>
  api<unknown>(path, body, key).pipe(
    Effect.flatMap(Schema.decodeUnknown(CardDetail)),
    Effect.flatMap((result) =>
      result.card.bank_id === bankId
        ? Effect.succeed(result)
        : Effect.fail(
            new BankingError({
              message:
                "Card response belongs to a different relationship. Refresh the saved cards.",
              status: 503,
            }),
          ),
    ),
    Effect.mapError(
      (error) =>
        new BankingError({
          message:
            error._tag === "ParseError"
              ? "Card response could not be verified. Inspect the saved command before retrying."
              : error.message,
          status: "status" in error ? error.status : 503,
        }),
    ),
  );
const storageFailure = () =>
  new BankingError({
    message:
      "The saved card instruction could not be stored or read. Restore browser storage before sending another change.",
    status: 503,
  });

export function Cards({
  bankId,
  role,
  busy,
  perform,
  openAccount,
  selectedCardId,
}: {
  bankId: string;
  role: Role;
  busy: boolean;
  perform: ServicePerform;
  openAccount: () => void;
  selectedCardId?: string;
}) {
  const storage = `openfinacle:card-command:${bankId}`;
  const [cards, setCards] = useState<readonly Card[] | null>(null);
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [draft, setDraft] = useState<CardCommand | null>(null);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const submitting = useRef(false);
  const currentCard = useRef(selectedCardId);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Effect.runPromise(
      Effect.gen(function* () {
        const saved = yield* Effect.try({
          try: () => sessionStorage.getItem(storage),
          catch: storageFailure,
        });
        const restored = saved
          ? yield* Schema.decodeUnknown(Schema.parseJson(pendingSchema))(
              saved,
            ).pipe(Effect.mapError(storageFailure))
          : null;
        if (active) setPending(restored);
        const result = yield* api<unknown>(`/cards?refresh=${revision}`).pipe(
          Effect.flatMap(
            Schema.decodeUnknown(Schema.Struct({ cards: Schema.Array(Card) })),
          ),
        );
        if (result.cards.some((card) => card.bank_id !== bankId))
          return yield* Effect.fail(
            new BankingError({
              message: "Saved cards belong to a different relationship.",
              status: 503,
            }),
          );
        const selected =
          restored?.input.id ??
          currentCard.current ??
          selectedCardId ??
          result.cards.find((card) => card.status !== "blocked")?.id ??
          result.cards[0]?.id;
        const current = selected
          ? yield* detailApi(
              bankId,
              `/cards?id=${encodeURIComponent(selected)}`,
            )
          : null;
        if (current && current.card.id !== selected)
          return yield* Effect.fail(
            new BankingError({
              message: "The selected card response could not be verified.",
              status: 503,
            }),
          );
        if (active) {
          setCards(result.cards);
          setDetail(current);
          setPending(restored);
          setError("");
          setLoading(false);
          setReadFailed(false);
        }
      }).pipe(
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active) {
              setError(failure.message);
              setLoading(false);
              setReadFailed(true);
            }
          }),
        ),
      ),
    );
    return () => {
      active = false;
    };
  }, [bankId, storage, revision, selectedCardId]);
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
  const accept = (result: CardDetail) =>
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => sessionStorage.removeItem(storage),
        catch: storageFailure,
      });
      yield* Effect.sync(() => {
        currentCard.current = result.card.id;
        setDetail(result);
        setPending(null);
        setDraft(null);
        setReview(false);
        setRetry(false);
        setNotice(
          "Card change recorded. The saved state and history are shown below.",
        );
        setError("");
        setRevision((value) => value + 1);
      });
    });
  const send = (command: Pending) => {
    if (
      submitting.current ||
      busy ||
      loading ||
      (pending &&
        !(retry && pending.key === command.key && command.role === role))
    )
      return;
    submitting.current = true;
    performHere(
      Effect.gen(function* () {
        yield* Effect.try({
          try: () => sessionStorage.setItem(storage, JSON.stringify(command)),
          catch: storageFailure,
        });
        yield* Effect.sync(() => {
          setPending(command);
          setRetry(false);
          setNotice("");
          setError("");
        });
        const result = yield* detailApi(
          bankId,
          "/cards/action",
          command.input,
          command.key,
        );
        if (
          result.confirmed_key !== command.key ||
          result.card.id !== command.input.id
        )
          return yield* Effect.fail(
            new BankingError({
              message:
                "The card instruction was not confirmed. Check the saved command.",
              status: 503,
            }),
          );
        yield* accept(result);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            submitting.current = false;
          }),
        ),
      ),
    );
  };
  const reconcile = () => {
    if (!pending) return;
    performHere(
      detailApi(bankId, `/cards?key=${encodeURIComponent(pending.key)}`).pipe(
        Effect.flatMap((result) =>
          result.confirmed_key === pending.key &&
          result.card.id === pending.input.id
            ? accept(result)
            : Effect.fail(
                new BankingError({
                  message:
                    "The saved command response does not match. Keep this instruction for inspection.",
                  status: 503,
                }),
              ),
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
  const confirm = () => {
    if (draft) send({ key: crypto.randomUUID(), role, input: draft });
  };
  const disabled = busy || loading || readFailed || pending !== null;
  const select = (id: string) =>
    performHere(
      detailApi(bankId, `/cards?id=${encodeURIComponent(id)}`).pipe(
        Effect.flatMap((result) =>
          result.card.id === id
            ? Effect.succeed(result)
            : Effect.fail(
                new BankingError({
                  message: "The selected card response could not be verified.",
                  status: 503,
                }),
              ),
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            currentCard.current = result.card.id;
            setDetail(result);
            setDraft(null);
            setReview(false);
            setError("");
            setNotice("");
          }),
        ),
      ),
    );
  return (
    <section className="panel card-workspace" aria-busy={busy || loading}>
      <div className="panel-heading">
        <div>
          <h2>
            {role === "customer" ? "My debit card" : "Customer card enquiry"}
          </h2>
          <p>Synthetic card controls · no card network connection</p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setRevision(revision + 1);
            setDraft(null);
            setReview(false);
          }}
        >
          Refresh cards
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
          <h3>Check your saved instruction</h3>
          <p>
            A card change may already be recorded. Check its reference before
            starting another change.
          </p>
          <code>{pending.key}</code>
          <div className="card-actions">
            <button
              type="button"
              disabled={busy || loading}
              onClick={reconcile}
            >
              Check saved command
            </button>
            {retry && role === pending.role && (
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
                      Effect.gen(function* () {
                        yield* Effect.try({
                          try: () => sessionStorage.removeItem(storage),
                          catch: storageFailure,
                        });
                        yield* Effect.sync(() => {
                          setPending(null);
                          setRetry(false);
                          setDraft(null);
                          setReview(false);
                          setRevision(revision + 1);
                        });
                      }),
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
      {!cards && !error && <p role="status">Loading saved cards…</p>}
      {cards?.length === 0 && (
        <div className="empty-state">
          <h3>No debit card yet</h3>
          <p>
            A synthetic debit card becomes available when this relationship
            opens an account.
          </p>
          <button type="button" disabled={busy} onClick={openAccount}>
            Account opening
          </button>
        </div>
      )}
      {detail && (
        <>
          {cards && cards.length > 1 && (
            <label className="card-instrument-picker">
              Selected demo card
              <FormSelect
                aria-label="Selected demo card"
                value={detail.card.id}
                disabled={disabled}
                onValueChange={select}
                options={cards.map((card) => ({
                  value: card.id,
                  label: `Demo ${card.suffix} · ${card.status === "blocked" ? "Permanently blocked" : card.activation_required ? "Awaiting activation" : card.status}`,
                }))}
              />
            </label>
          )}
          <div className="card-summary">
            <div>
              <span>OpenFinacle debit · Demo {detail.card.suffix}</span>
              <h3>
                {detail.card.status === "active"
                  ? "Active"
                  : detail.card.status === "held"
                    ? detail.card.activation_required
                      ? "Awaiting demo activation"
                      : "Temporarily held"
                    : "Permanently blocked"}
              </h3>
              <p>
                {detail.card.status === "held"
                  ? detail.card.activation_required
                    ? "Complete recorded delivery and activate in Replacement requests. Normal controls become available afterward."
                    : "All usage is held. Saved channel settings are retained."
                  : detail.card.status === "blocked"
                    ? "This instrument cannot resume. Open Replacement requests to inspect or request a distinct demo card."
                    : "Manage channel access and your daily usage limit."}
              </p>
            </div>
            <div>
              <span>Daily limit</span>
              <strong>{formatMoney(detail.card.settings.daily_limit)}</strong>
              <small>Version {detail.card.version}</small>
            </div>
          </div>
          <dl className="card-channels">
            {Object.entries(channels).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {detail.card.status !== "active"
                    ? "Unavailable"
                    : detail.card.settings[key as keyof typeof channels]
                      ? "Enabled"
                      : "Disabled"}
                </dd>
              </div>
            ))}
          </dl>
          {!draft && (
            <div className="card-actions">
              {detail.actions.map((action) => (
                <button
                  type="button"
                  key={action}
                  disabled={disabled}
                  onClick={() => {
                    setDraft({
                      id: detail.card.id,
                      version: detail.card.version,
                      action,
                      note: "",
                      ...(action === "settings"
                        ? { settings: detail.card.settings }
                        : {}),
                    });
                    setReview(false);
                    setNotice("");
                  }}
                >
                  {labels[action]}
                </button>
              ))}
            </div>
          )}
          {draft && (
            <form
              className="card-form"
              onSubmit={(event) => {
                event.preventDefault();
                setReview(true);
              }}
            >
              <h3>{review ? "Review card change" : labels[draft.action]}</h3>
              {draft.settings && (
                <fieldset disabled={review || disabled}>
                  <legend>Usage settings</legend>
                  {Object.entries(channels).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={draft.settings?.[key as keyof typeof channels]}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            settings: {
                              ...detail.card.settings,
                              ...draft.settings,
                              [key]: event.target.checked,
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <label>
                    Daily limit (₹)
                    <input
                      type="number"
                      min="0"
                      max="100000"
                      step="1"
                      required
                      value={draft.settings.daily_limit}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          settings: {
                            ...detail.card.settings,
                            ...draft.settings,
                            daily_limit: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                </fieldset>
              )}
              <label>
                Reason
                <textarea
                  required
                  minLength={5}
                  maxLength={300}
                  disabled={review || disabled}
                  value={draft.note}
                  onChange={(event) =>
                    setDraft({ ...draft, note: event.target.value })
                  }
                />
              </label>
              {review && (
                <p>
                  Action: {labels[draft.action]}. Review the settings and reason
                  above. This changes only the synthetic card.
                </p>
              )}
              <div className="card-actions">
                {!review ? (
                  <button type="submit" disabled={disabled}>
                    Review change
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setReview(false)}
                    >
                      Edit change
                    </button>
                    {draft.action === "block" ? (
                      <AlertDialog.Root>
                        <AlertDialog.Trigger asChild>
                          <button type="button" disabled={disabled}>
                            Confirm permanent block
                          </button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Portal>
                          <AlertDialog.Overlay className="centre-overlay centre-confirm-overlay" />
                          <AlertDialog.Content
                            className="centre-dialog centre-confirm-dialog"
                            onEscapeKeyDown={(event) => {
                              if (busy) event.preventDefault();
                            }}
                          >
                            <AlertDialog.Title>
                              Permanently block this demo card?
                            </AlertDialog.Title>
                            <AlertDialog.Description>
                              This cannot be undone. Saved card history is
                              retained. No actual bank card is affected.
                            </AlertDialog.Description>
                            <div className="card-actions">
                              <AlertDialog.Cancel asChild>
                                <button type="button" disabled={busy}>
                                  Keep card
                                </button>
                              </AlertDialog.Cancel>
                              <AlertDialog.Action asChild>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={confirm}
                                >
                                  Block card permanently
                                </button>
                              </AlertDialog.Action>
                            </div>
                          </AlertDialog.Content>
                        </AlertDialog.Portal>
                      </AlertDialog.Root>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={confirm}
                      >
                        Confirm card change
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setDraft(null);
                    setReview(false);
                  }}
                >
                  Cancel change
                </button>
              </div>
            </form>
          )}
          <h3>Card history</h3>
          <ol className="card-history">
            {[...detail.history].reverse().map((event) => (
              <li key={event.id}>
                <strong>
                  {event.action === "issued"
                    ? "Demo card issued"
                    : labels[event.action as keyof typeof labels]}
                </strong>
                <span>
                  {event.actor} · {event.status} · Version {event.version}
                </span>
                <p>{event.note}</p>
                <small>{event.created_at}</small>
                <details>
                  <summary>Saved controls</summary>
                  <p>Daily limit: {formatMoney(event.settings.daily_limit)}</p>
                  {Object.entries(channels).map(([key, label]) => (
                    <p key={key}>
                      {label}:{" "}
                      {event.settings[key as keyof typeof channels]
                        ? "Enabled"
                        : "Disabled"}
                    </p>
                  ))}
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
