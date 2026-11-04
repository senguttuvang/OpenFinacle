"use client";
import { Effect } from "effect";
import { useEffect, useRef, useState } from "react";
import type { Role } from "../../banking-workspace/domain/banking";
import type { CaseDetail } from "../../service-requests/domain/service-cases";
import { serviceDefinition } from "../../service-requests/domain/services";
import { serviceCaseApi } from "../../service-requests/ui/service-case-api";
import {
  ServiceCaseDetail,
  serviceReference,
  serviceStatus,
} from "../../service-requests/ui/service-case-detail";
import type { ServicePerform } from "../../service-requests/ui/service-request-form";
import "../../service-requests/ui/service-centre.css";
import type { BranchRelationship } from "../domain/branch-day";
import { CaseResponsibility } from "./service-work/case-responsibility";

export function BranchServiceHistory({
  relationship,
  reviewFixture = false,
  role,
  caseChanged,
}: {
  relationship: BranchRelationship;
  reviewFixture?: boolean;
  role: Role;
  caseChanged: (next: CaseDetail) => void;
}) {
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const customerId = relationship.customer.id;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const executing = useRef(false);
  const perform: ServicePerform = (task, message) => {
    if (executing.current) return;
    executing.current = true;
    setBusy(true);
    setNotice("");
    void Effect.runPromise(task)
      .then(() => setNotice(message))
      .catch(() =>
        setNotice(
          "The action was not confirmed. Review the saved request history before another action.",
        ),
      )
      .finally(() => {
        executing.current = false;
        setBusy(false);
      });
  };
  const readPath = `/branch/service-case?customerId=${encodeURIComponent(customerId)}&id=${encodeURIComponent(selected)}`;
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
            "The saved service history could not be verified. Refresh the saved enquiry before acting.",
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
            disabled={reviewFixture || busy}
            aria-pressed={selected === request.id}
            onClick={() => setSelected(request.id)}
          >
            {serviceReference(request.id)} · {request.kind} ·{" "}
            {serviceStatus(
              detail?.request.id === request.id
                ? detail.request.status
                : request.status,
            )}
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
            disabled={loading || busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh service history
          </button>
          {loading && <p role="status">Reading saved request timeline…</p>}
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {detail && (
            <>
              <CaseResponsibility
                branchId={relationship.customer.branch_id}
                customerId={customerId}
                requestId={detail.request.id}
                role={role}
              />
              <p>Delivery: {serviceStatus(detail.request.delivery_status)}</p>
              <p>
                Recorded outcome:{" "}
                {detail.request.outcome_note || "No outcome recorded"}
              </p>
              <p>Last actor: {detail.request.updated_by || "Not recorded"}</p>
              <ServiceCaseDetail
                key={`${selected}-${revision}`}
                initial={detail}
                definition={serviceDefinition(detail.request.kind)}
                busy={busy}
                perform={perform}
                changed={() => {}}
                readPath={readPath}
                actionPath={`/branch/service-case/action?customerId=${encodeURIComponent(customerId)}`}
                updated={(next) => {
                  setDetail(next);
                  caseChanged(next);
                }}
              />
              <p>
                Actions use existing demo staff authority and saved versions.
                Delivery recording is an application declaration, not physical
                verification.
              </p>
            </>
          )}
        </article>
      )}
    </section>
  );
}
