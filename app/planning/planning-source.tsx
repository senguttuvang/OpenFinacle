import { PlanningPreviewSession } from "./planning-preview-session";
import type { usePlanningRepository } from "./planning-repository";
import "./planning-source.css";

type Repository = ReturnType<typeof usePlanningRepository>;
export function PlanningSource({
  repository: r,
  embedded = false,
}: {
  repository: Repository;
  embedded?: boolean;
}) {
  return (
    <section className="wp-source" aria-label="Planning data source">
      <div className="wp-actions">
        <strong>Planning data source</strong>
        {!embedded && (
          <>
            <button
              type="button"
              className="secondary"
              aria-pressed={r.mode === "device"}
              disabled={r.busy}
              onClick={() => r.setMode("device")}
            >
              Device preview
            </button>
            <button
              type="button"
              className="secondary"
              aria-pressed={r.mode === "shared"}
              disabled={r.busy}
              onClick={() => r.setMode("shared")}
            >
              Shared relationship
            </button>
          </>
        )}
        <button
          type="button"
          className="secondary"
          disabled={r.busy}
          onClick={r.refresh}
        >
          Reload planning
        </button>
      </div>
      <p>
        {r.mode === "device"
          ? "Device-only synthetic preview. Edits survive reload on this device; they are separate from shared server records and banking roles."
          : "Shared planning uses the current relationship session. It never falls back to device records when the server cannot verify access."}
      </p>
      {!embedded && (
        <PlanningPreviewSession
          busy={r.busy}
          onReady={() => {
            r.setMode("shared");
            r.refresh();
          }}
        />
      )}
      {r.mode === "shared" && r.relationship && (
        <p>
          Relationship <strong>{r.relationship}</strong> ·{" "}
          {r.readOnly
            ? r.ready
              ? "Consented planning review · read only"
              : "Officer planning access requires household consent"
            : "Customer-owned planning"}
        </p>
      )}
      {r.mode === "shared" && r.missing && r.relationship && !r.readOnly && (
        <div>
          <p>
            This synthetic household has not been set up for this relationship.
            Setup creates defaults once and never resets existing records.
          </p>
          <button
            type="button"
            disabled={r.busy || !!r.pending}
            onClick={() => void r.setup()}
          >
            Set up this synthetic household
          </button>
        </div>
      )}
      {r.mode === "shared" && r.ready && !r.readOnly && (
        <div className="wp-actions">
          <span>
            Read-only officer planning review:{" "}
            <strong>
              {r.state.adviserConsent ? "Consented" : "Not consented"}
            </strong>
          </span>
          <button
            type="button"
            className="secondary"
            disabled={!r.canEdit}
            onClick={() =>
              void r.persist({
                ...r.state,
                adviserConsent: !r.state.adviserConsent,
              })
            }
          >
            {r.state.adviserConsent
              ? "Revoke planning review consent"
              : "Grant read-only planning review"}
          </button>
        </div>
      )}
      {r.mode === "shared" && r.pending && (
        <div className="wp-pending" role="status">
          <h2>Inspect the retained planning command</h2>
          <p>
            Further shared edits are locked. The original inputs and reference
            survive reload; no automatic retry occurs.
          </p>
          <p>
            Reference {r.pending.key} · {r.pending.action} · input version{" "}
            {r.pending.input.version}
          </p>
          <div className="wp-actions">
            <button
              type="button"
              disabled={r.busy}
              onClick={() => void r.inspect()}
            >
              Inspect retained command
            </button>
            {r.retryAllowed && (
              <>
                <button
                  type="button"
                  className="secondary"
                  disabled={r.busy || r.readOnly}
                  onClick={() => void r.retry()}
                >
                  Retry original command
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={r.busy}
                  onClick={r.discard}
                >
                  Discard unrecorded command
                </button>
              </>
            )}
          </div>
          <details>
            <summary>Original scenario and budget snapshot</summary>
            <p>
              {r.pending.input.scenarios
                .map((s) => `${s.name} v${s.version}`)
                .join(" · ")}
            </p>
            <pre>{JSON.stringify(r.pending.input, null, 2)}</pre>
          </details>
        </div>
      )}
      {r.mode === "shared" && r.ready && (
        <details>
          <summary>
            Planning change history · latest {r.history.length} entries
          </summary>
          <div className="wp-table">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Action / actor</th>
                  <th>Recorded at</th>
                  <th>Audit reference</th>
                </tr>
              </thead>
              <tbody>
                {r.history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.version}</td>
                    <td>
                      {entry.action} · {entry.actor}
                    </td>
                    <td>{entry.created_at}</td>
                    <td>{entry.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
