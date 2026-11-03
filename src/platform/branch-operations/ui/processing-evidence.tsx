"use client";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../banking-workspace/ui/api";
import { coreDate } from "../domain/branch-day";
import { ProcessingEvidence } from "../domain/processing";

export function ProcessingEnquiry({
  customerId,
  branchId,
  reviewFixture,
}: {
  customerId: string;
  branchId: string;
  reviewFixture?: boolean;
}) {
  const [evidence, setEvidence] = useState<ProcessingEvidence | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setEvidence(null);
    setError("");
    if (reviewFixture || !customerId) return;
    setBusy(true);
    Effect.runPromise(
      api<unknown>(
        `/branch/processing?customerId=${encodeURIComponent(customerId)}&revision=${revision}`,
      ).pipe(
        Effect.flatMap(Schema.decodeUnknown(ProcessingEvidence)),
        Effect.flatMap((value) =>
          value.branchId === branchId
            ? Effect.succeed(value)
            : Effect.fail(new Error("Processing branch does not match.")),
        ),
      ),
    )
      .then((value) => {
        if (active) setEvidence(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Processing evidence is unavailable or invalid. Refresh to read again.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, branchId, reviewFixture, revision]);
  return (
    <section aria-label="Core processing enquiry">
      <h4>Core processing enquiry</h4>
      <p>
        Tenant-wide metadata from Apache Fineract, read through servicing branch{" "}
        {branchId}. Job times are shown as reported by Core; no timezone is
        inferred. These separate reads do not prove branch or account COB
        completion, reconciliation or financial close.
      </p>
      {reviewFixture ? (
        <p>STATIC REVIEW FIXTURE — no processing source connected.</p>
      ) : !customerId ? (
        <p>No registered relationship is available for this enquiry.</p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setRevision((n) => n + 1)}
        >
          Refresh processing evidence
        </button>
      )}
      {busy && <p role="status">Reading Core processing metadata…</p>}
      {error && <p role="alert">{error}</p>}
      {evidence && (
        <>
          <p>
            Observed {new Date(evidence.observedAt).toLocaleString("en-IN")} ·
            read-only; job execution and date changes are not offered.
          </p>
          {evidence.errors.map((message) => (
            <p role="alert" key={message}>
              {message}
            </p>
          ))}
          <p>
            Scheduler:{" "}
            <strong>
              {evidence.scheduler
                ? evidence.scheduler.active
                  ? "Active"
                  : "Inactive"
                : "Unavailable"}
            </strong>
            . This reports scheduler state only.
          </p>
          <h5>Core business dates</h5>
          {evidence.businessDates === null ? (
            <p>Business-date evidence unavailable.</p>
          ) : evidence.businessDates.length === 0 ? (
            <p>
              No business-date rows returned. Agreement with the application
              date remains unknown.
            </p>
          ) : (
            <ul>
              {evidence.businessDates.map((row) => (
                <li key={row.type}>
                  {row.type}: {coreDate(row.date)}
                </li>
              ))}
            </ul>
          )}
          <h5>Scheduled jobs</h5>
          {evidence.jobs === null ? (
            <p>Job evidence unavailable; no zero counts inferred.</p>
          ) : (
            <>
              <p>
                {evidence.jobs.length} returned jobs ·{" "}
                {evidence.jobs.filter((j) => j.active).length} enabled ·{" "}
                {evidence.jobs.filter((j) => j.currentlyRunning).length}{" "}
                reported running. No branch completion inferred from these
                counts or last-run statuses.
              </p>
              {evidence.jobs.length === 0 ? (
                <p>No job rows returned.</p>
              ) : (
                <div className="table-scroll">
                  <table className="branch-table">
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>Enabled / running</th>
                        <th>Next run · Core value</th>
                        <th>Last run · Core values</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidence.jobs.map((job) => (
                        <tr key={job.jobId}>
                          <td>
                            {job.displayName}
                            <small>Core job {job.jobId}</small>
                          </td>
                          <td>
                            {job.active ? "Enabled" : "Disabled"} /{" "}
                            {job.currentlyRunning ? "Running" : "Not running"}
                          </td>
                          <td>{job.nextRunTime ?? "Not returned"}</td>
                          <td>
                            {job.lastRunHistory ? (
                              <>
                                {job.lastRunHistory.status}
                                <small>
                                  Start:{" "}
                                  {job.lastRunHistory.jobRunStartTime ??
                                    "Not returned"}
                                </small>
                                <small>
                                  End:{" "}
                                  {job.lastRunHistory.jobRunEndTime ??
                                    "Not returned"}
                                </small>
                              </>
                            ) : (
                              "Not returned"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
