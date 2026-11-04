"use client";
import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import type { Role } from "../../../banking-workspace/domain/banking";
import type {
  ResponsibilityCommand,
  ResponsibilityDetail,
} from "../../domain/service-work/responsibility";
import {
  matchesResponsibilityScope,
  PendingResponsibility,
  type ResponsibilityScope,
  readResponsibilityApi,
  saveResponsibilityApi,
} from "./responsibility-api";

export function useResponsibility(scope: ResponsibilityScope, role: Role) {
  const { branchId, customerId, requestId } = scope;
  const storageKey = `openfinacle-case-responsibility:${scope.branchId}:${scope.customerId}:${scope.requestId}`;
  const [pending, setPending] = useState<PendingResponsibility | null>(null),
    [blocked, setBlocked] = useState(false),
    [ready, setReady] = useState(false),
    [detail, setDetail] = useState<ResponsibilityDetail | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = useRef(true),
    locked = useRef(false);
  useEffect(() => {
    active.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = Schema.decodeUnknownSync(
          Schema.parseJson(PendingResponsibility),
          {
            onExcessProperty: "error",
          },
        )(raw);
        if (
          !matchesResponsibilityScope(
            { branchId, customerId, requestId },
            saved,
          )
        )
          throw new Error("Recovery scope differs from this case");
        setPending(saved);
        setMessage(
          "An original assignment awaits inspection. No request was replayed.",
        );
      }
    } catch {
      setBlocked(true);
      setMessage(
        "The saved recovery reference cannot be read. Changes are withheld.",
      );
    }
    setReady(true);
    return () => {
      active.current = false;
    };
  }, [storageKey, branchId, customerId, requestId]);
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
            : "Assignment outcome is unconfirmed. Inspect the original reference.",
        );
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  };
  const release = () => {
    try {
      sessionStorage.removeItem(storageKey);
      setPending(null);
      return true;
    } catch {
      setBlocked(true);
      return false;
    }
  };
  const confirmed = (value: ResponsibilityDetail) => {
    release();
    setDetail(value);
    setMessage(
      `Original assignment confirmed at version ${value.confirmedEvent?.version}. Latest responsibility version ${value.latest?.version ?? 0}.`,
    );
  };
  const post = (original: PendingResponsibility) =>
    saveResponsibilityApi(scope, original).pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          if (
            active.current &&
            error.uncertain === false &&
            [400, 403, 409].includes(error.status) &&
            !error.message.startsWith("Customer selection changed.")
          )
            release();
        }),
      ),
    );
  return {
    pending,
    blocked,
    ready,
    detail,
    busy,
    message,
    refresh: () => {
      setDetail(null);
      void perform(readResponsibilityApi(scope), setDetail);
    },
    inspect: () => {
      if (pending)
        void perform(readResponsibilityApi(scope, pending), confirmed);
    },
    retry: () => {
      if (pending && pending.actor === role && !blocked)
        void perform(post(pending), confirmed);
    },
    save: (command: ResponsibilityCommand) => {
      if (!ready || blocked || pending || locked.current || role === "customer")
        return;
      const original: PendingResponsibility = {
        branchId: scope.branchId,
        customerId: scope.customerId,
        requestId: scope.requestId,
        key: crypto.randomUUID(),
        actor: role,
        command: { ...command, note: command.note.trim() },
      };
      try {
        Schema.decodeUnknownSync(PendingResponsibility)(original);
        sessionStorage.setItem(storageKey, JSON.stringify(original));
      } catch {
        setBlocked(true);
        setMessage(
          "Cannot preserve a valid recovery reference. The assignment was not sent.",
        );
        return;
      }
      setPending(original);
      setDetail(null);
      void perform(post(original), confirmed);
    },
  };
}
