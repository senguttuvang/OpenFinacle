"use client";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../banking-workspace/ui/api";
export function useBranchEvidence<A extends { branchId: string }, I>(
  path: string,
  schema: Schema.Schema<A, I>,
  branchId: string,
  enabled: boolean,
  unavailableMessage = "Loan evidence is unavailable or invalid. Refresh to read again.",
) {
  const [saved, setValue] = useState<{
    data: A;
    path: string;
    schema: Schema.Schema<A, I>;
    branchId: string;
    revision: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setValue(null);
    setError("");
    setLoading(false);
    if (!enabled) return;
    setLoading(true);
    Effect.runPromise(
      api<unknown>(`${path}&revision=${revision}`).pipe(
        Effect.flatMap(Schema.decodeUnknown(schema)),
        Effect.flatMap((data) =>
          data.branchId === branchId
            ? Effect.succeed(data)
            : Effect.fail(new Error("Branch evidence mismatch")),
        ),
      ),
    )
      .then((data) => {
        if (active) setValue({ data, path, schema, branchId, revision });
      })
      .catch(() => {
        if (active) setError(unavailableMessage);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, schema, branchId, enabled, revision, unavailableMessage]);
  const value =
    enabled &&
    saved?.path === path &&
    saved.schema === schema &&
    saved.branchId === branchId &&
    saved.revision === revision
      ? saved.data
      : null;
  return { value, error, loading, refresh: () => setRevision((n) => n + 1) };
}
