import { Effect } from "effect";
import { useEffect, useState } from "react";
import { api } from "../api";
import { FormSelect } from "../form-select";

export function PlanningPreviewSession({
  busy,
  onReady,
}: {
  busy: boolean;
  onReady: () => void;
}) {
  const [local, setLocal] = useState(false);
  const [relationship, setRelationship] = useState(
    "synthetic-preview-household",
  );
  const [role, setRole] = useState("customer");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Effect.runPromise(
      Effect.either(api<{ localOnly: boolean }>("/planning-preview/info")),
    ).then((result) => {
      if (active && result._tag === "Right" && result.right.localOnly === true)
        setLocal(true);
    });
    return () => {
      active = false;
    };
  }, []);
  if (!local) return null;
  return (
    <details className="wp-preview-session">
      <summary>Local planning-only demonstration session</summary>
      <p>
        This server and D1 database are isolated from banking. Choose an
        invented relationship and persona to test ownership and consent; no real
        identity verification occurs.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void Effect.runPromise(
            Effect.either(
              api("/planning-preview/session", { relationship, role }),
            ),
          ).then((result) => {
            if (result._tag === "Left") setError(result.left.message);
            else {
              onReady();
            }
          });
        }}
      >
        <div className="wp-input-grid">
          <label>
            Local synthetic relationship
            <input
              required
              pattern="synthetic-preview-[a-z0-9-]{1,60}"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Planning preview persona
            <FormSelect
              aria-label="Planning preview persona"
              value={role}
              onValueChange={setRole}
              disabled={busy}
              options={[
                { value: "customer", label: "Customer owner" },
                {
                  value: "officer",
                  label: "Officer · consented read-only review",
                },
                {
                  value: "approver",
                  label: "Banking approver · no planning access",
                },
              ]}
            />
          </label>
          <button type="submit" disabled={busy}>
            Use local preview session
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
