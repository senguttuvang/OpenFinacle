"use client";
import { Effect } from "effect";
import { useEffect, useState } from "react";
import type { CaseDetail } from "../../service-requests/domain/service-cases";
import { serviceCaseApi } from "../../service-requests/ui/service-case-api";
import {
  serviceReference,
  serviceStatus,
} from "../../service-requests/ui/service-case-detail";
import type { BranchRelationship } from "../domain/branch-day";

export function BranchServiceHistory({
  relationship,
  reviewFixture = false,
}: {
  relationship: BranchRelationship;
  reviewFixture?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const customerId = relationship.customer.id;
  useEffect(() => {
    let active = true;
    setDetail(null);
    setError("");
    if (!selected || reviewFixture) return;
    setLoading(true);
    Effect.runPromise(
      serviceCaseApi(
        `/branch/service-case?customerId=${encodeURIComponent(customerId)}&id=${encodeURIComponent(selected)}&revision=${revision}`,
      ),
    )
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch(() => {
        if (active)
          setError(
            "The saved service history could not be verified. Refresh this read-only enquiry.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, customerId, revision, reviewFixture]);
  return (
    <section aria-label="Customer service history">
      <h4>Service history</h4>
      <p>
        Application workflow evidence. Completion does not establish physical
        delivery, core posting or identity verification.
      </p>
      {relationship.requests.map((request) => (
        <p key={request.id}>
          <button
            type="button"
            disabled={reviewFixture}
            aria-pressed={selected === request.id}
            onClick={() => setSelected(request.id)}
          >
            {serviceReference(request.id)} · {request.kind} ·{" "}
            {serviceStatus(request.status)}
          </button>{" "}
          {request.detail}
        </p>
      ))}
      {!relationship.requests.length && (
        <p>No recorded service requests in the loaded scope.</p>
      )}
      {reviewFixture && (
        <p>STATIC REVIEW FIXTURE. Saved case timelines are not connected.</p>
      )}
      {selected && !reviewFixture && (
        <article
          className="branch-day-item"
          aria-label="Selected service request"
        >
          <button
            type="button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh service history
          </button>
          {loading && <p role="status">Reading saved request timeline…</p>}
          {error && <p role="alert">{error}</p>}
          {detail && (
            <>
              <h4>
                {serviceReference(detail.request.id)} · {detail.request.kind}
              </h4>
              <p>
                {serviceStatus(detail.request.status)} · version{" "}
                {detail.request.version} · updated {detail.request.updated_at}{" "}
                UTC
              </p>
              <p>Delivery: {serviceStatus(detail.request.delivery_status)}</p>
              <p>
                Recorded outcome:{" "}
                {detail.request.outcome_note || "No outcome recorded"}
              </p>
              <p>Last actor: {detail.request.updated_by || "Not recorded"}</p>
              <ol>
                {detail.history.map((event) => (
                  <li key={event.id}>
                    <strong>{serviceStatus(event.to_status)}</strong> ·{" "}
                    {event.actor} · {event.created_at} UTC
                    <p>{event.note || "No note recorded"}</p>
                    <p>{event.detail}</p>
                    <small>
                      Previous:{" "}
                      {event.from_status
                        ? serviceStatus(event.from_status)
                        : "Initial record"}{" "}
                      · Delivery: {serviceStatus(event.delivery_status)}
                    </small>
                  </li>
                ))}
              </ol>
              {!detail.history.length && (
                <p>No saved timeline events returned.</p>
              )}
              <p>
                Read-only branch enquiry. Use the customer’s service centre for
                permitted case actions.
              </p>
            </>
          )}
        </article>
      )}
    </section>
  );
}
