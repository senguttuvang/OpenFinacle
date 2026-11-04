"use client";
import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import type { Role } from "../../../banking-workspace/domain/banking";
import type { CashCountDetail, CashCountList } from "../../domain/cash-counts";
import {
  countDetailApi,
  countListApi,
  PendingCount,
  saveCountApi,
} from "./count-api";

export function useCashCounts(
  customerId: string,
  branchId: string,
  role: Role,
) {
  const storageKey = `openfinacle-count:${branchId}:${role}`;
  const [pending, setPending] = useState<PendingCount | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [list, setList] = useState<CashCountList | null>(null);
  const [detail, setDetail] = useState<CashCountDetail | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = useRef(true),
    locked = useRef(false);
  useEffect(() => {
    active.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        setPending(
          Schema.decodeUnknownSync(Schema.parseJson(PendingCount), {
            onExcessProperty: "error",
          })(raw),
        );
        setMessage(
          "An original count request awaits inspection. No request was replayed.",
        );
      }
    } catch {
      setBlocked(true);
      setMessage(
        "The saved recovery reference cannot be read. Changes are withheld to prevent a duplicate declaration.",
      );
    }
    return () => {
      active.current = false;
    };
  }, [storageKey]);
  const perform = async <A, E>(
    effect: Effect.Effect<A, E>,
    accept: (value: A) => void,
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await Effect.runPromise(Effect.either(effect));
      if (!active.current) return;
      if (result._tag === "Right") accept(result.right);
      else {
        setDetail(null);
        setMessage(
          result.left instanceof Error
            ? result.left.message
            : "Count outcome is unconfirmed. Inspect the original reference.",
        );
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };
  const confirmed = (value: CashCountDetail) => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      setBlocked(true);
    }
    setPending(null);
    setDetail(value);
    setList(null);
    setMessage(
      `Confirmed original ${value.confirmedEvent?.action} at version ${value.confirmedEvent?.version}. Latest saved state: ${value.record.status}, version ${value.record.version}.`,
    );
  };
  const post = (request: PendingCount) =>
    saveCountApi(customerId, branchId, request, role).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          // Only a definite server rejection releases the original request. A scope-change
          // rejection is client-side and may follow a completed server write.
          if (
            active.current &&
            error.uncertain === false &&
            [400, 403, 409].includes(error.status) &&
            !error.message.startsWith("Customer selection changed.")
          ) {
            try {
              sessionStorage.removeItem(storageKey);
              setPending(null);
            } catch {
              setBlocked(true);
            }
          }
        }),
      ),
    );
  const save = (request: PendingCount) => {
    if (locked.current || blocked || pending) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request));
    } catch {
      setBlocked(true);
      setMessage(
        "Cannot preserve a recovery reference. The request was not sent.",
      );
      return;
    }
    setPending(request);
    setDetail(null);
    void perform(post(request), confirmed);
  };
  // Recovery remains explicit. Even a 404 is only absence at that read, not proof of a failed write.
  return {
    pending,
    blocked,
    list,
    detail,
    busy,
    message,
    save,
    refresh: () => {
      setDetail(null);
      setList(null);
      void perform(countListApi(customerId, branchId), setList);
    },
    open: (id: string) => {
      setDetail(null);
      void perform(countDetailApi(customerId, branchId, { id }), setDetail);
    },
    inspect: () => {
      if (pending)
        void perform(
          countDetailApi(
            customerId,
            branchId,
            { key: pending.key },
            pending,
            role,
          ),
          confirmed,
        );
    },
    retry: () => {
      if (pending) void perform(post(pending), confirmed);
    },
  };
}
