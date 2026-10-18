"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ReplacementCommand,
  ReplacementTerms,
} from "../src/domain/card-replacements";
import type { Card } from "../src/domain/cards";
import { FormSelect } from "./form-select";

export const replacementLabels = {
  recommend: "Recommend replacement",
  issue: "Issue demo replacement",
  dispatch: "Record demo dispatch",
  deliver: "Record demo delivery",
  activate: "Activate delivered demo card",
  reject: "Reject replacement",
  cancel: "Cancel replacement request",
};
export const replacementReasons = {
  damaged: "Damaged card",
  expired: "Expired card",
  lost: "Lost card",
};
export const replacementConfirm = {
  recommend:
    "Record the review for a separate approver. No replacement is issued at this step.",
  issue:
    "The source demo instrument will be permanently blocked and a distinct held replacement created with all channels disabled. No fee, real card or network instruction.",
  dispatch:
    "Record simulated dispatch only. No courier is contacted and no shipment is created.",
  deliver:
    "Record simulated receipt only. This is not courier proof; the customer must still activate the demo instrument.",
  activate:
    "Activate the delivered demo instrument with its channels still disabled. This does not generate or set a PIN, OTP or network credential.",
  reject:
    "Reject this request. The decision cannot be undone; no replacement is issued.",
  cancel:
    "Cancel this request before recommendation. Cancellation cannot be undone; no replacement is issued.",
};
export function ReplacementApplicationForm({
  source,
  disabled,
  submit,
  cancel,
  openCard,
}: {
  source: Card;
  disabled: boolean;
  submit: (input: ReplacementTerms) => void;
  cancel: () => void;
  openCard: () => void;
}) {
  const [terms, setTerms] = useState<ReplacementTerms>({
    source_card_id: source.id,
    source_version: source.version,
    reason: "damaged",
    address: "",
  });
  const [review, setReview] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: !review });
  }, [review]);
  const needsBlock = terms.reason === "lost" && source.status !== "blocked";
  return (
    <form
      className="deposit-form replacement-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!needsBlock) setReview(true);
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        {review
          ? "Review demo replacement application"
          : "Request a demo replacement card"}
      </h3>
      <p>
        Source instrument: Demo {source.suffix} · reviewed version{" "}
        {terms.source_version}. Use invented delivery details only. No fee, real
        card, PIN or courier instruction.
      </p>
      {review ? (
        <dl className="detail-grid">
          <div>
            <dt>Replacement reason</dt>
            <dd>{replacementReasons[terms.reason]}</dd>
          </div>
          <div>
            <dt>Confirmed demo delivery address</dt>
            <dd className="replacement-address">{terms.address}</dd>
          </div>
        </dl>
      ) : (
        <fieldset disabled={disabled}>
          <legend>Replacement details</legend>
          <label>
            Replacement reason
            <FormSelect
              aria-label="Replacement reason"
              value={terms.reason}
              onValueChange={(value) =>
                setTerms({
                  ...terms,
                  reason: value as ReplacementTerms["reason"],
                })
              }
              options={Object.entries(replacementReasons).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </label>
          <label>
            Confirmed demo delivery address
            <textarea
              required
              minLength={10}
              maxLength={300}
              value={terms.address}
              aria-describedby="replacement-address-help"
              onBlur={() =>
                setTerms({ ...terms, address: terms.address.trim() })
              }
              onChange={(event) =>
                setTerms({ ...terms, address: event.target.value })
              }
            />
          </label>
          <p id="replacement-address-help">
            Confirm a fictional address for this request. This does not update
            your saved profile or send a shipment.
          </p>
        </fieldset>
      )}
      {needsBlock && (
        <div className="empty-state">
          <p>
            Permanently block this lost demo card in Card controls before
            requesting its replacement. A replacement request does not block it
            immediately.
          </p>
          <button type="button" disabled={disabled} onClick={openCard}>
            Open source card controls
          </button>
        </div>
      )}
      {review && (
        <p>
          An officer reviews the request before a separate approver issues the
          held replacement and permanently retires the source instrument.
          Dispatch, delivery and customer activation are separate demo steps.
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
              Edit replacement application
            </button>
            <button
              type="button"
              disabled={disabled || needsBlock}
              onClick={() => submit(terms)}
            >
              Submit replacement application
            </button>
          </>
        ) : (
          <button type="submit" disabled={disabled || needsBlock}>
            Review replacement application
          </button>
        )}
        <button type="button" disabled={disabled} onClick={cancel}>
          Leave replacement application
        </button>
      </div>
    </form>
  );
}

export function ReplacementActionForm({
  command,
  disabled,
  submit,
  cancel,
}: {
  command: ReplacementCommand;
  disabled: boolean;
  submit: (input: ReplacementCommand) => void;
  cancel: () => void;
}) {
  const [note, setNote] = useState(command.note);
  const [review, setReview] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: !review });
  }, [review]);
  return (
    <form
      className="deposit-form replacement-form"
      onSubmit={(event) => {
        event.preventDefault();
        setReview(true);
      }}
    >
      <h3 ref={heading} tabIndex={-1}>
        {review
          ? "Review replacement instruction"
          : replacementLabels[command.action]}
      </h3>
      <p>{replacementConfirm[command.action]}</p>
      <p>
        Request version {command.version}
        {command.source_version !== undefined
          ? ` · reviewed source-card version ${command.source_version}`
          : ""}
        {command.card_version !== undefined
          ? ` · reviewed replacement-card version ${command.card_version}`
          : ""}
      </p>
      <label>
        Replacement instruction reason
        <textarea
          required
          minLength={5}
          maxLength={300}
          disabled={disabled || review}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => setNote(note.trim())}
        />
      </label>
      <div className="card-actions">
        {review ? (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setReview(false)}
            >
              Edit replacement instruction
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => submit({ ...command, note })}
            >
              Confirm {replacementLabels[command.action].toLowerCase()}
            </button>
          </>
        ) : (
          <button type="submit" disabled={disabled}>
            Review replacement instruction
          </button>
        )}
        <button type="button" disabled={disabled} onClick={cancel}>
          Leave replacement instruction
        </button>
      </div>
    </form>
  );
}
