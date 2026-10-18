"use client";

import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import {
  BankingError,
  type Role,
} from "../../banking-workspace/domain/banking";
import { api } from "../../banking-workspace/ui/api";
import { FormSelect } from "../../form-controls/form-select";
import type { ServicePerform } from "../../service-requests/ui/service-request-form";
import {
  Replacement,
  ReplacementCommand,
  ReplacementDetail,
  ReplacementTerms,
} from "../domain/card-replacements";
import { Card } from "../domain/cards";
import {
  ReplacementRecord,
  replacementReference,
  replacementStatus,
} from "./card-replacement-record";
import {
  ReplacementActionForm,
  ReplacementApplicationForm,
  replacementLabels,
  replacementReasons,
} from "./card-replacement-terms";

const Pending = Schema.Struct({
  key: Schema.String,
  role: Schema.Literal("customer", "officer", "approver"),
  instruction: Schema.Union(
    Schema.Struct({ kind: Schema.Literal("submit"), input: ReplacementTerms }),
    Schema.Struct({
      kind: Schema.Literal("action"),
      input: ReplacementCommand,
    }),
  ),
});
type Pending = typeof Pending.Type;
const invalid = () =>
  new BankingError({
    message:
      "Replacement response could not be verified. Inspect the saved instruction before retrying.",
    status: 503,
  });
const storageFailure = () =>
  new BankingError({
    message:
      "The replacement instruction could not be stored or read. Restore browser storage before sending another instruction.",
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
      Schema.decodeUnknown(ReplacementDetail)(value).pipe(
        Effect.mapError(invalid),
      ),
    ),
    Effect.flatMap((result) =>
      result.replacement.bank_id === bankId &&
      result.source.bank_id === bankId &&
      result.source.id === result.replacement.terms.source_card_id &&
      (result.replacement.card_id === null
        ? result.card === null
        : result.card?.id === result.replacement.card_id &&
          result.card.bank_id === bankId)
        ? Effect.succeed(result)
        : Effect.fail(invalid()),
    ),
  );

export function CardReplacements({
  bankId,
  role,
  busy,
  perform,
  openAccount,
  openCard,
}: {
  bankId: string;
  role: Role;
  busy: boolean;
  perform: ServicePerform;
  openAccount: () => void;
  openCard: (id: string) => void;
}) {
  const storage = `openfinacle:replacement-command:${bankId}`;
  const [records, setRecords] = useState<readonly Replacement[] | null>(null);
  const [cards, setCards] = useState<readonly Card[] | null>(null);
  const [detail, setDetail] = useState<ReplacementDetail | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [retry, setRetry] = useState(false);
  const [application, setApplication] = useState<Card | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [action, setAction] = useState<ReplacementCommand | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusTarget = detail?.replacement.id;
  useEffect(() => {
    if (focusTarget) heading.current?.focus();
  }, [focusTarget]);
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
          catch: storageFailure,
        });
        const restored = saved
          ? yield* Schema.decodeUnknown(Schema.parseJson(Pending))(saved).pipe(
              Effect.mapError(storageFailure),
            )
          : null;
        if (active) {
          setPending(restored);
          setRetry(false);
        }
        const [requests, instruments] = yield* Effect.all(
          [
            api<unknown>(`/card-replacements?refresh=${revision}`).pipe(
              Effect.flatMap((value) =>
                Schema.decodeUnknown(
                  Schema.Struct({ replacements: Schema.Array(Replacement) }),
                )(value).pipe(Effect.mapError(invalid)),
              ),
            ),
            api<unknown>(`/cards?refresh=${revision}`).pipe(
              Effect.flatMap((value) =>
                Schema.decodeUnknown(
                  Schema.Struct({ cards: Schema.Array(Card) }),
                )(value).pipe(Effect.mapError(invalid)),
              ),
            ),
          ],
          { concurrency: 2 },
        );
        if (
          requests.replacements.some((record) => record.bank_id !== bankId) ||
          instruments.cards.some((card) => card.bank_id !== bankId)
        )
          return yield* Effect.fail(invalid());
        if (active) {
          setRecords(requests.replacements);
          setCards(instruments.cards);
          setReadFailed(false);
          setLoading(false);
          setError("");
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
  }, [bankId, storage, revision]);
  const accept = (result: ReplacementDetail) =>
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => sessionStorage.removeItem(storage),
        catch: storageFailure,
      });
      yield* Effect.sync(() => {
        setDetail(result);
        setPending(null);
        setAction(null);
        setApplication(null);
        setRetry(false);
        setError("");
        setNotice(
          "Replacement instruction recorded. The saved instruments and history are shown below.",
        );
        setRevision((value) => value + 1);
      });
    });
  const verified = (result: ReplacementDetail, command: Pending) => {
    if (result.confirmed_key !== command.key) return false;
    if (command.instruction.kind === "action")
      return result.replacement.id === command.instruction.input.id;
    const expected = command.instruction.input;
    const actual = result.replacement.terms;
    return (
      actual.source_card_id === expected.source_card_id &&
      actual.source_version === expected.source_version &&
      actual.reason === expected.reason &&
      actual.address === expected.address.trim()
    );
  };
  const send = (command: Pending, originalRetry = false) => {
    if (
      inFlight.current ||
      busy ||
      loading ||
      (pending &&
        !(
          originalRetry &&
          retry &&
          pending.key === command.key &&
          command.role === role
        ))
    )
      return;
    inFlight.current = true;
    performHere(
      Effect.gen(function* () {
        yield* Effect.try({
          try: () => sessionStorage.setItem(storage, JSON.stringify(command)),
          catch: storageFailure,
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
            ? "/card-replacements"
            : "/card-replacements/action",
          command.instruction.input,
          command.key,
        );
        if (!verified(result, command)) return yield* Effect.fail(invalid());
        yield* accept(result);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            inFlight.current = false;
          }),
        ),
      ),
    );
  };
  const inspect = () => {
    if (!pending) return;
    performHere(
      detailApi(
        bankId,
        `/card-replacements?key=${encodeURIComponent(pending.key)}`,
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
        catch: storageFailure,
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setPending(null);
            setRetry(false);
            setAction(null);
            setApplication(null);
            setRevision((value) => value + 1);
          }),
        ),
      ),
    );
  const select = (id: string) =>
    performHere(
      detailApi(bankId, `/card-replacements?id=${encodeURIComponent(id)}`).pipe(
        Effect.flatMap((result) =>
          result.replacement.id === id
            ? Effect.succeed(result)
            : Effect.fail(invalid()),
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            setDetail(result);
            setAction(null);
            setApplication(null);
            setError("");
            setNotice("");
          }),
        ),
      ),
    );
  const locked =
    busy ||
    loading ||
    readFailed ||
    pending !== null ||
    records === null ||
    cards === null;
  const eligible =
    cards?.filter(
      (card) =>
        !records?.some(
          (record) =>
            record.terms.source_card_id === card.id &&
            (record.card_id !== null ||
              record.status === "submitted" ||
              record.status === "recommended"),
        ),
    ) ?? [];
  const selected = eligible.find((card) => card.id === sourceId) ?? eligible[0];
  return (
    <section
      className="panel card-workspace replacement-workspace"
      aria-busy={busy || loading}
    >
      <div className="panel-heading">
        <div>
          <h2>
            {role === "customer"
              ? "My replacement requests"
              : "Customer replacement requests"}
          </h2>
          <p>Distinct saved demo instruments · no real card or courier</p>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => {
            setRevision((value) => value + 1);
            setDetail(null);
            setAction(null);
            setApplication(null);
          }}
        >
          Refresh replacement requests
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
          <h3>Check your saved replacement instruction</h3>
          <p>
            Its outcome is not confirmed. Inspect this reference before another
            instruction.
          </p>
          <code>{pending.key}</code>
          <div className="card-actions">
            <button type="button" disabled={busy || loading} onClick={inspect}>
              Check saved replacement instruction
            </button>
            {retry && pending.role === role && (
              <>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => send(pending, true)}
                >
                  Retry original replacement instruction
                </button>
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={discard}
                >
                  Discard unrecorded replacement instruction
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {records === null && !error && (
        <p role="status">Loading saved replacement requests…</p>
      )}
      {role === "customer" && cards?.length === 0 && (
        <div className="empty-state">
          <h3>Open an account before requesting a replacement</h3>
          <p>An opened relationship provides the original demo instrument.</p>
          <button type="button" disabled={busy} onClick={openAccount}>
            Account opening
          </button>
        </div>
      )}
      {role === "customer" && !!eligible.length && !application && (
        <div className="deposit-form">
          <label>
            Source demo card
            <FormSelect
              aria-label="Source demo card"
              disabled={locked}
              value={selected?.id ?? ""}
              onValueChange={setSourceId}
              options={eligible.map((card) => ({
                value: card.id,
                label: `Demo ${card.suffix} · ${card.status}`,
              }))}
            />
          </label>
          <button
            type="button"
            disabled={locked || !selected}
            onClick={() => {
              if (selected) {
                setApplication(selected);
                setDetail(null);
                setAction(null);
                setNotice("");
              }
            }}
          >
            Request a demo replacement
          </button>
        </div>
      )}
      {application && (
        <ReplacementApplicationForm
          key={application.id + application.version}
          source={application}
          disabled={locked}
          cancel={() => setApplication(null)}
          openCard={() => openCard(application.id)}
          submit={(input) =>
            send({
              key: crypto.randomUUID(),
              role,
              instruction: { kind: "submit", input },
            })
          }
        />
      )}
      {records?.length === 0 && !application && (
        <div className="empty-state">
          <h3>No replacement requests</h3>
          <p>
            Saved applications, issuance, simulated delivery and activation will
            appear here.
          </p>
        </div>
      )}
      {!!records?.length && (
        <ul className="deposit-list">
          {records.map((record) => (
            <li key={record.id}>
              <div>
                <strong>
                  {replacementReference(record.id)} ·{" "}
                  {replacementReasons[record.terms.reason]}
                </strong>
                <span>{replacementStatus[record.status]}</span>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => select(record.id)}
              >
                View {replacementReference(record.id)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {detail && (
        <ReplacementRecord
          detail={detail}
          disabled={locked}
          openCard={openCard}
          headingRef={action ? undefined : heading}
        >
          {action ? (
            <ReplacementActionForm
              key={`${action.id}:${action.version}:${action.action}`}
              command={action}
              disabled={locked}
              cancel={() => setAction(null)}
              submit={(input) =>
                send({
                  key: crypto.randomUUID(),
                  role,
                  instruction: { kind: "action", input },
                })
              }
            />
          ) : (
            <div className="card-actions">
              {detail.actions.map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={locked}
                  onClick={() =>
                    setAction({
                      id: detail.replacement.id,
                      version: detail.replacement.version,
                      action: value,
                      note: "",
                      ...(value === "issue"
                        ? { source_version: detail.source.version }
                        : {}),
                      ...(value === "activate" && detail.card
                        ? { card_version: detail.card.version }
                        : {}),
                    })
                  }
                >
                  {replacementLabels[value]}
                </button>
              ))}
            </div>
          )}
        </ReplacementRecord>
      )}
    </section>
  );
}
