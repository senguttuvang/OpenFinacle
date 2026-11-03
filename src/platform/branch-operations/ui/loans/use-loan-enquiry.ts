"use client";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../../banking-workspace/ui/api";
export function useBranchLoanRead<A extends { branchId: string }, I>(
  path: string,
  schema: Schema.Schema<A, I>,
  branchId: string,
  enabled: boolean,
) {
  const [value, setValue] = useState<A | null>(null);
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
        if (active) setValue(data);
      })
      .catch(() => {
        if (active)
          setError(
            "Loan evidence is unavailable or invalid. Refresh to read again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, schema, branchId, enabled, revision]);
  return { value, error, loading, refresh: () => setRevision((n) => n + 1) };
}
