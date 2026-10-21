"use client";

import type { ReactNode, Ref } from "react";
import type {
  Replacement,
  ReplacementDetail,
} from "../domain/card-replacements";
import {
  replacementLabels,
  replacementReasons,
} from "./card-replacement-terms";

export const replacementStatus: Record<Replacement["status"], string> = {
  submitted: "Awaiting officer review",
  recommended: "Awaiting independent issuance",
  issued: "Held replacement issued",
  dispatched: "Demo dispatch recorded",
  delivered: "Demo delivery recorded",
  activated: "Demo card activated",
  rejected: "Replacement rejected",
  cancelled: "Replacement cancelled",
};
export const replacementReference = (id: string) =>
  `CR-${id.slice(0, 8).toUpperCase()}`;
export function ReplacementRecord({
  detail,
  disabled,
  openCard,
  children,
  headingRef,
}: {
  detail: ReplacementDetail;
  disabled: boolean;
  openCard: (id: string) => void;
  children?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const { replacement: request, source, card } = detail;
  return (
    <div className="replacement-record">
      <h3 ref={headingRef} tabIndex={-1}>
        {replacementReference(request.id)} · {replacementStatus[request.status]}
      </h3>
      <p>
        Persistent synthetic instruments only. No real card, courier, PIN, fee
        or savings debit.
      </p>
      <dl className="detail-grid">
        <div>
          <dt>Source instrument</dt>
          <dd>
            Demo {source.suffix} ·{" "}
            {source.status === "blocked"
              ? "Permanently blocked"
              : source.status === "held"
                ? "Held"
                : "Active"}
          </dd>
        </div>
        <div>
          <dt>Replacement reason</dt>
          <dd>{replacementReasons[request.terms.reason]}</dd>
        </div>
        <div>
          <dt>Confirmed demo delivery address</dt>
          <dd className="replacement-address">{request.terms.address}</dd>
        </div>
        <div>
          <dt>Request version</dt>
          <dd>{request.version}</dd>
        </div>
        {card && (
          <div>
            <dt>Distinct replacement instrument</dt>
            <dd>
              Demo {card.suffix} ·{" "}
              {card.status === "blocked"
                ? "Permanently blocked"
                : card.activation_required
                  ? "Awaiting demo activation"
                  : card.status === "held"
                    ? "Held"
                    : "Active"}
            </dd>
          </div>
        )}
      </dl>
      {card?.activation_required && card.status !== "blocked" && (
        <p>
          Channels stay disabled until activation; after activation, configure
          them explicitly in Card controls. Delivery is simulated and does not
          set a PIN.
        </p>
      )}
      {card?.status === "blocked" && (
        <p>
          The replacement instrument is permanently blocked and cannot activate
          or resume. A later replacement must reference that instrument.
        </p>
      )}
      <div className="card-actions">
        <button
          type="button"
          disabled={disabled}
          onClick={() => openCard(source.id)}
        >
          View source card controls
        </button>
        {card && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => openCard(card.id)}
          >
            View replacement card controls
          </button>
        )}
      </div>
      {children}
      <h3>Replacement history</h3>
      <ol className="card-history replacement-history">
        {detail.history.map((event) => (
          <li key={event.id}>
            <strong>
              {event.action === "submit"
                ? "Replacement application submitted"
                : (replacementLabels[
                    event.action as keyof typeof replacementLabels
                  ] ?? event.action)}
            </strong>
            <span>
              {event.actor} · {replacementStatus[event.status]} · Version{" "}
              {event.version}
            </span>
            <p>{event.note}</p>
            <small>{event.created_at}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
