"use client";

import { Effect } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormSelect } from "../../form-controls/form-select";
import {
  type OnboardingDraft,
  type OnboardingErrors,
  type OnboardingFields,
  validateOnboarding,
} from "../domain/onboarding";
import {
  beginOnboarding,
  loadOnboarding,
  saveOnboarding,
} from "./onboarding-api";
import "./onboarding.css";
import { setApiCustomerScope } from "../../banking-workspace/ui/api";

const storageKey = "openfinacle-onboarding-operation";
export function useAccountOpening({ onOpened }: { onOpened?: () => void }) {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [fields, setFields] = useState<OnboardingFields | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [canStartAnother, setCanStartAnother] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const focusStep = draft?.status === "draft" ? step : -1;
  const locked = useRef(false);
  const apply = useCallback((saved: OnboardingDraft) => {
    setApiCustomerScope(saved.bankId);
    setDraft(saved);
    setFields(saved.fields);
    setStep(saved.step);
    setConfirming(false);
    setUncertain(false);
  }, []);
  useEffect(() => {
    let active = true;
    Effect.runPromise(Effect.either(loadOnboarding())).then((result) => {
      if (!active) return;
      if (result._tag === "Right") apply(result.right);
      else if (
        result.left.status !== 404 &&
        result.left.status !== 401 &&
        result.left.status !== 409 &&
        result.left.status !== 403
      )
        setError(result.left.message);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [apply]);
  useEffect(() => {
    if (focusStep >= 0) heading.current?.focus();
  }, [focusStep]);
  useEffect(() => {
    if (confirming) confirmationHeading.current?.focus();
  }, [confirming]);
  const execute = <A, E extends { message: string }>(
    effect: Effect.Effect<A, E>,
    success: (value: A) => void,
    write = false,
  ) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    Effect.runPromise(Effect.either(effect))
      .then((result) => {
        if (result._tag === "Right") success(result.right);
        else {
          setError(result.left.message);
          if (write) setUncertain(true);
        }
      })
      .finally(() => {
        locked.current = false;
        setBusy(false);
      });
  };
  const update = <K extends keyof OnboardingFields>(
    key: K,
    value: OnboardingFields[K],
  ) => {
    if (!fields) return;
    setFields({
      ...fields,
      [key]: value,
      ...(key === "email" || key === "phone" ? { contactVerified: false } : {}),
      ...(key !== "termsAccepted" && key !== "accuracyConfirmed"
        ? { accuracyConfirmed: false }
        : {}),
    });
    setErrors({ ...errors, [key]: undefined });
    setConfirming(false);
    setMessage("Changes not yet saved");
  };
  const move = (next: number, validate: boolean) => {
    if (!draft || !fields) return;
    const found = validate ? validateOnboarding(fields, step) : {};
    setErrors(found);
    if (Object.keys(found).length) {
      setError("Check the highlighted fields before continuing.");
      return;
    }
    execute(
      saveOnboarding(draft, fields, next),
      (saved) => {
        apply(saved);
        setMessage("Draft saved");
      },
      true,
    );
  };
  const start = (separate: boolean) => {
    if (locked.current) return;
    // Persist before dispatch. A lost response always reuses the original identity.
    try {
      const identity = separate
        ? crypto.randomUUID()
        : (operationId ??
          localStorage.getItem(storageKey) ??
          crypto.randomUUID());
      localStorage.setItem(storageKey, identity);
      setOperationId(identity);
      setCanStartAnother(false);
      if (separate) {
        setDraft(null);
        setFields(null);
      }
      execute(
        beginOnboarding(identity).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => setCanStartAnother(error.status === 403)),
          ),
        ),
        apply,
        true,
      );
    } catch {
      setError(
        "Device storage is unavailable. Enable it to start a resumable application.",
      );
    }
  };
  const refresh = () =>
    execute(loadOnboarding(), (saved) => {
      apply(saved);
      setMessage("Saved status loaded");
    });
  const field = (
    key:
      | "name"
      | "email"
      | "phone"
      | "birthDate"
      | "address"
      | "city"
      | "pincode"
      | "occupation"
      | "nomineeName"
      | "nomineeRelationship",
    label: string,
    options?: readonly string[],
    placeholder?: string,
  ) => (
    <div className="onboarding-field">
      <label htmlFor={`opening-${key}`}>{label}</label>
      {options ? (
        <FormSelect
          id={`opening-${key}`}
          value={String(fields?.[key] ?? "")}
          onValueChange={(value) => update(key, value)}
          placeholder="Choose an option"
          options={[
            { value: "", label: "Choose an option" },
            ...options.map((option) => ({ value: option, label: option })),
          ]}
          aria-invalid={Boolean(errors[key])}
          aria-describedby={errors[key] ? `opening-${key}-error` : undefined}
        />
      ) : (
        <input
          type={key === "email" ? "email" : "text"}
          inputMode={
            key === "pincode"
              ? "numeric"
              : key === "email"
                ? "email"
                : undefined
          }
          id={`opening-${key}`}
          value={String(fields?.[key] ?? "")}
          onChange={(event) => update(key, event.target.value)}
          placeholder={placeholder}
          maxLength={key === "address" ? 145 : key === "pincode" ? 6 : 80}
          autoComplete="off"
          aria-invalid={Boolean(errors[key])}
          aria-describedby={errors[key] ? `opening-${key}-error` : undefined}
        />
      )}
      {errors[key] && (
        <span className="onboarding-field-error" id={`opening-${key}-error`}>
          {errors[key]}
        </span>
      )}
    </div>
  );
  const checkbox = (
    key: "eligible" | "termsAccepted" | "accuracyConfirmed",
    label: string,
  ) => (
    <div className="onboarding-field">
      <label className="onboarding-choice">
        <input
          type="checkbox"
          checked={Boolean(fields?.[key])}
          onChange={(event) => update(key, event.target.checked)}
          aria-invalid={Boolean(errors[key])}
          aria-describedby={errors[key] ? `opening-${key}-error` : undefined}
        />
        {label}
      </label>
      {errors[key] && (
        <span className="onboarding-field-error" id={`opening-${key}-error`}>
          {errors[key]}
        </span>
      )}
    </div>
  );
  return {
    onOpened,
    draft,
    setDraft,
    fields,
    setFields,
    step,
    setStep,
    busy,
    setBusy,
    loading,
    setLoading,
    error,
    setError,
    message,
    setMessage,
    errors,
    setErrors,
    confirming,
    setConfirming,
    uncertain,
    setUncertain,
    operationId,
    setOperationId,
    canStartAnother,
    setCanStartAnother,
    heading,
    confirmationHeading,
    focusStep,
    locked,
    apply,
    execute,
    update,
    move,
    start,
    refresh,
    field,
    checkbox,
  };
}

export const statusText: Record<string, string> = {
  submitted: "Submitted for identity review",
  awaiting_approval: "Awaiting independent approval",
  approved: "Account opened",
  needs_changes: "Branch requested changes",
  opening: "Account opening in progress",
  opening_exception: "Account opening needs inspection",
};
