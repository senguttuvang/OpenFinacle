"use client";

import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { BankingError } from "../src/domain/banking";
import { ProfileDetail } from "../src/domain/profile";
import type { Dashboard } from "../src/domain/view";
import { api } from "./api";
import { serviceReference } from "./service-case-detail";

const fields = (record: ProfileDetail["profile"]["fields"]) => ({
  Email: record.email,
  Mobile: record.phone,
  Address: [record.address, record.city, record.pincode]
    .filter(Boolean)
    .join(", "),
  "Home branch": record.home_branch,
  Employer: record.employer || "Not recorded",
});

export function CustomerProfile({
  data,
  openServices,
  openCase,
  openAccount,
}: {
  data: Dashboard;
  openServices: () => void;
  openCase: (reference: string) => void;
  openAccount: () => void;
}) {
  const [saved, setSaved] = useState<ProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const [revision, setRevision] = useState(0);
  const bankId = data.bank.id;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEmpty(false);
    void Effect.runPromise(
      Effect.gen(function* () {
        const value = yield* api<unknown>(`/profile?refresh=${revision}`).pipe(
          Effect.flatMap(Schema.decodeUnknown(ProfileDetail)),
          Effect.mapError((failure) =>
            failure._tag === "ParseError"
              ? new BankingError({
                  message:
                    "The saved profile response could not be verified. Refresh before relying on these details.",
                  status: 503,
                })
              : failure,
          ),
        );
        if (
          value.profile.bank_id !== bankId ||
          value.history.some((event) => event.bank_id !== bankId)
        )
          return yield* Effect.fail(
            new BankingError({
              message:
                "The profile response does not match this relationship. Ask the branch to inspect it.",
              status: 503,
            }),
          );
        if (active) setSaved(value);
      }).pipe(
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active) {
              setError(failure.status === 404 ? "" : failure.message);
              setEmpty(failure.status === 404);
            }
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setLoading(false);
          }),
        ),
      ),
    );
    return () => {
      active = false;
    };
  }, [bankId, revision]);
  return (
    <section className="panel" aria-busy={loading}>
      <div className="panel-heading">
        <div>
          <h2>
            {data.role === "customer" ? "My profile" : "Customer profile"}
          </h2>
          <p>Synthetic profile for this demonstration</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => setRevision(revision + 1)}
        >
          Refresh profile
        </button>
      </div>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading saved profile…</p>}
      {empty && (
        <div className="empty-state">
          <h3>No opened-account profile yet</h3>
          <p>
            Contact details become available when this relationship opens an
            account.
          </p>
          <button type="button" className="secondary" onClick={openAccount}>
            Account opening
          </button>
        </div>
      )}
      {saved && !empty && (
        <>
          <div className="detail-grid">
            <div>
              <small>Customer name</small>
              <strong>
                {data.account?.clientName ?? "Demonstration customer"}
              </strong>
            </div>
            {Object.entries(fields(saved.profile.fields)).map(
              ([label, value]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ),
            )}
          </div>
          <p>
            Changes appear here after independent approval. Earlier completed
            cases have not been replayed into this profile.
          </p>
          {data.role === "customer" && (
            <button type="button" className="secondary" onClick={openServices}>
              Request a profile change
            </button>
          )}
          <h3>Profile history</h3>
          <ol>
            {[...saved.history].reverse().map((event) => (
              <li key={event.id}>
                <details>
                  <summary>
                    {event.case_id
                      ? "Approved profile change"
                      : "Imported baseline"}{" "}
                    ·{" "}
                    {new Date(event.created_at).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </summary>
                  <p>{event.note}</p>
                  <p>
                    Recorded by {event.actor} · Version {event.version}
                  </p>
                  <dl className="detail-grid">
                    {Object.entries(fields(event.fields)).map(
                      ([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ),
                    )}
                  </dl>
                  {event.case_id && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (event.case_id)
                          openCase(serviceReference(event.case_id));
                      }}
                    >
                      View {serviceReference(event.case_id)}
                    </button>
                  )}
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
