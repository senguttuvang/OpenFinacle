"use client";
import { useEffect, useState } from "react";
import type { Role } from "../../../banking-workspace/domain/banking";
import type { ResponsibilityCommand } from "../../domain/service-work/responsibility";
import type { ResponsibilityScope } from "./responsibility-api";
import { useResponsibility } from "./use-responsibility";

interface Props extends ResponsibilityScope {
  role: Role;
  reviewFixture?: boolean;
}
export function CaseResponsibility(props: Props) {
  if (props.reviewFixture)
    return (
      <p>
        STATIC REVIEW FIXTURE — service responsibility history is not connected.
      </p>
    );
  return (
    <ResponsibilityPanel
      key={`${props.branchId}:${props.customerId}:${props.requestId}:${props.role}`}
      {...props}
    />
  );
}
function ResponsibilityPanel(scope: Props) {
  const [open, setOpen] = useState(false),
    [owner, setOwner] = useState(""),
    [note, setNote] = useState("");
  const state = useResponsibility(scope, scope.role),
    detail = state.detail;
  useEffect(() => {
    if (detail) {
      setOwner(detail.latest?.owner ?? "");
      setNote("");
    }
  }, [detail]);
  const locked =
    state.busy ||
    state.blocked ||
    !state.ready ||
    !!state.pending ||
    !detail?.historyComplete;
  return (
    <section
      aria-label={`Service responsibility ${scope.requestId}`}
      className="branch-day-item"
    >
      <h5>Service responsibility</h5>
      <p>
        Saved application workflow labels only. They grant no staff permission
        or approval authority, reopen no case, and certify neither delivery nor
        financial effects.
      </p>
      {state.blocked && (
        <p role="alert">
          Recovery storage cannot be verified. Changes are withheld; saved
          history remains available.
        </p>
      )}
      {!open && (
        <button
          type="button"
          disabled={state.busy}
          onClick={() => {
            setOpen(true);
            state.refresh();
          }}
        >
          Inspect service responsibility
        </button>
      )}
      {state.pending && (
        <p role="status">
          Pending original reference {state.pending.key} · actor{" "}
          {state.pending.actor}. No automatic retry.
        </p>
      )}
      {open && (
        <>
          <button type="button" disabled={state.busy} onClick={state.refresh}>
            Refresh responsibility history
          </button>
          {state.busy && <p role="status">Reading or saving responsibility…</p>}
          {state.message && <p role="status">{state.message}</p>}
          {detail && (
            <>
              <p>
                Source: application workflow · servicing branch{" "}
                {detail.branchId} · observed{" "}
                {new Date(detail.observedAt).toLocaleString("en-IN")}. Separate
                from the financial observation above.
              </p>
              <p>
                Latest responsibility:{" "}
                <strong>{detail.latest?.owner ?? "Unassigned"}</strong> ·
                version {detail.latest?.version ?? 0}
              </p>
              {!detail.historyComplete && (
                <p role="alert">
              Only the first 200 assignment events are shown. Latest state is
                  separate; further changes are withheld.
                </p>
              )}
              <ol>
                {detail.history.map((e) => (
                  <li key={e.id}>
                    Version {e.version} · {e.owner ?? "Unassigned"} · actor{" "}
                    {e.actor} demo persona · {e.createdAt} · {e.note}
                  </li>
                ))}
              </ol>
              {!detail.history.length && (
                <p>
                  No responsibility assignments in saved history. Last case
                  actor is not an assigned owner.
                </p>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  state.save({
                    version: detail.latest?.version ?? 0,
                    owner: (owner || null) as ResponsibilityCommand["owner"],
                    note,
                  });
                }}
              >
                <label>
                  Responsible work viewpoint
                  <select
                    aria-label="Responsible work viewpoint"
                    value={owner}
                    disabled={locked}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {["teller", "checker", "manager", "accountant"].map(
                      (value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Responsibility reason
                  <textarea
                    aria-label="Responsibility reason"
                    value={note}
                    minLength={5}
                    maxLength={500}
                    required
                    disabled={locked}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={
                    locked ||
                    note.trim().length < 5 ||
                    (detail.latest?.owner ?? "") === owner
                  }
                >
                  Save service responsibility
                </button>
              </form>
            </>
          )}
          {state.pending && (
            <>
              <p>
                Original request: {state.pending.command.owner ?? "Unassigned"}{" "}
                · expected version {state.pending.command.version} ·{" "}
                {state.pending.command.note}
              </p>
              <button
                type="button"
                disabled={state.busy || state.blocked}
                onClick={state.inspect}
              >
                Inspect original assignment
              </button>
              <button
                type="button"
                disabled={
                  state.busy ||
                  state.blocked ||
                  state.pending.actor !== scope.role
                }
                onClick={state.retry}
              >
                Retry original assignment
              </button>
              {state.pending.actor !== scope.role && (
                <p>
                  Retry requires the original {state.pending.actor} demo role.
                  Inspection does not grant that authority.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
