"use client";
import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import { api } from "../../banking-workspace/ui/api";
import { RelationshipEnquiry } from "../domain/relationship";
export interface RelationshipState {
  value: RelationshipEnquiry | null;
  loading: boolean;
  error: string;
  reload: () => void;
}
export function useRelationshipEnquiry(
  customerId: string,
  reviewFixture = false,
): RelationshipState {
  const [value, setValue] = useState<RelationshipEnquiry | null>(null);
  const [loading, setLoading] = useState(!reviewFixture);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setValue(null);
    setError("");
    if (reviewFixture) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Effect.runPromise(
      api<unknown>(
        `/branch/relationship?customerId=${encodeURIComponent(customerId)}&revision=${revision}`,
      ).pipe(Effect.flatMap(Schema.decodeUnknown(RelationshipEnquiry))),
    )
      .then((result) => {
        if (active) setValue(result);
      })
      .catch(() => {
        if (active)
          setError(
            "Customer enquiry could not be read or verified. Refresh to retry this read-only enquiry.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, reviewFixture, revision]);
  return { value, loading, error, reload: () => setRevision((r) => r + 1) };
}
