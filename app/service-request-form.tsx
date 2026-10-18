"use client";

import { Effect } from "effect";
import { useId, useState } from "react";
import type { CaseDetail } from "../src/domain/service-cases";
import {
  type ServiceDefinition,
  validateServiceFields,
} from "../src/domain/services";
import { FormSelect } from "./form-select";
import { serviceCaseApi } from "./service-case-api";

export type ServicePerform = <A>(
  task: Effect.Effect<A, { message: string }>,
  message: string,
  refresh?: boolean,
) => void;
interface Draft {
  code: string;
  fields: Record<string, string>;
  key: string;
}
export const pendingStorageKey = (bank: string) =>
  `openfinacle:service-submission:${bank}`;
const readDraft = (bank: string): Draft | null => {
  const saved = sessionStorage.getItem(pendingStorageKey(bank));
  if (!saved) return null;
  const value: unknown = JSON.parse(saved);
  if (
    typeof value !== "object" ||
    !value ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    !("key" in value) ||
    typeof value.key !== "string" ||
    !("fields" in value) ||
    typeof value.fields !== "object" ||
    !value.fields ||
    Object.values(value.fields).some((v) => typeof v !== "string")
  )
    throw new Error("Saved submission needs inspection.");
  return value as Draft;
};

export function ServiceFields({
  definition,
  values,
  onChange,
  disabled,
}: {
  definition: ServiceDefinition;
  values: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
  disabled: boolean;
}) {
  const prefix = useId();
  return (
    <div className="centre-fields">
      {definition.fields.map((field) => (
        <label key={field.key} htmlFor={`${prefix}-${field.key}`}>
          {field.label}
          <span className="sr-only"> (required)</span>
          {field.type === "select" ? (
            <FormSelect
              id={`${prefix}-${field.key}`}
              required
              value={values[field.key] ?? ""}
              disabled={disabled}
              onValueChange={(value) => onChange(field.key, value)}
              placeholder="Select an option"
              options={[
                { value: "", label: "Select an option" },
                ...(field.options ?? []).map((option) => ({
                  value: option,
                  label: option,
                })),
              ]}
            />
          ) : field.type === "textarea" ? (
            <textarea
              id={`${prefix}-${field.key}`}
              required
              maxLength={field.maxLength}
              value={values[field.key] ?? ""}
              disabled={disabled}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          ) : (
            <input
              id={`${prefix}-${field.key}`}
              required
              type={field.type}
              maxLength={field.maxLength}
              inputMode={field.format === "pincode" ? "numeric" : undefined}
              value={values[field.key] ?? ""}
              disabled={disabled}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}

export function ServiceRequestForm({
  definition,
  catalog,
  bank,
  busy,
  perform,
  complete,
}: {
  definition: ServiceDefinition;
  catalog: readonly ServiceDefinition[];
  bank: string;
  busy: boolean;
  perform: ServicePerform;
  complete: (detail: CaseDetail) => void;
}) {
  const [initial] = useState(() => {
    try {
      return { draft: readDraft(bank), error: "" };
    } catch {
      return {
        draft: null,
        error:
          "The saved submission reference could not be read. Restore browser storage before submitting another request.",
      };
    }
  });
  const [draft, setDraft] = useState<Draft>(
    initial.draft ?? {
      code: definition.code,
      fields: {},
      key: crypto.randomUUID(),
    },
  );
  const [review, setReview] = useState(!!initial.draft);
  const [uncertain, setUncertain] = useState(!!initial.draft);
  const [error, setError] = useState(initial.error);
  const [storageBlocked] = useState(!!initial.error);
  const current = catalog.find((item) => item.code === draft.code);
  if (!current)
    return (
      <p role="alert">
        The saved service is unavailable. Inspect your requests before
        submitting another.
      </p>
    );
  const check = () => {
    setError("");
    perform(
      serviceCaseApi(
        `/service-cases?key=${encodeURIComponent(draft.key)}`,
      ).pipe(
        Effect.tap((result) => Effect.sync(() => complete(result))),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (failure.status === 404) {
              setUncertain(false);
              setError(
                "No request is recorded with this reference. You may retry these same reviewed details.",
              );
            } else setError(failure.message);
          }),
        ),
      ),
      "Submission reference checked.",
      false,
    );
  };
  const submit = () => {
    setError("");
    perform(
      Effect.try({
        try: () =>
          sessionStorage.setItem(
            pendingStorageKey(bank),
            JSON.stringify(draft),
          ),
        catch: () => ({
          message:
            "The submission reference could not be saved. Enable browser storage and try again; no request was sent.",
        }),
      }).pipe(
        Effect.tap(() => Effect.sync(() => setUncertain(true))),
        Effect.flatMap(() =>
          serviceCaseApi(
            "/service-cases",
            { code: draft.code, fields: draft.fields },
            draft.key,
          ),
        ),
        Effect.tap((result) => Effect.sync(() => complete(result))),
        Effect.tapError((failure) =>
          Effect.sync(() => setError(failure.message)),
        ),
      ),
      "Service request recorded.",
    );
  };
  return (
    <div className="centre-form">
      <h3>{current.title}</h3>
      <p>{current.description}</p>
      <p id="service-demo-note" className="centre-note">
        Use invented details in this demonstration. Requests are simulated; no
        physical item is dispatched.
      </p>
      {error && (
        <p className="centre-error" role="alert">
          {error}
        </p>
      )}
      {uncertain ? (
        <section
          className="centre-reconcile"
          aria-label="Check submission outcome"
        >
          <h3>Check your submission before continuing</h3>
          <p>
            The response may have been interrupted. Check this reference to
            avoid recording the request twice.
          </p>
          <code>{draft.key}</code>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={check}
          >
            Check submission status
          </button>
        </section>
      ) : review ? (
        <>
          <h3>Review your request</h3>
          <dl className="centre-summary">
            {current.fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{draft.fields[field.key]}</dd>
              </div>
            ))}
          </dl>
          <p>
            {current.approval
              ? "The branch will verify your request before an independent review."
              : "The service desk will review your request."}
          </p>
          <div className="centre-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy || storageBlocked}
              onClick={() => setReview(false)}
            >
              Edit details
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || storageBlocked}
              onClick={submit}
            >
              {busy ? "Submitting…" : "Confirm request"}
            </button>
          </div>
        </>
      ) : (
        <form
          aria-describedby="service-demo-note"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            void Effect.runPromise(
              validateServiceFields(current, draft.fields).pipe(
                Effect.tap((fields) =>
                  Effect.sync(() => {
                    setDraft({ ...draft, fields });
                    setReview(true);
                  }),
                ),
                Effect.catchAll((failure) =>
                  Effect.sync(() => setError(failure.message)),
                ),
              ),
            );
          }}
        >
          <ServiceFields
            definition={current}
            values={draft.fields}
            disabled={busy || storageBlocked}
            onChange={(key, value) =>
              setDraft({ ...draft, fields: { ...draft.fields, [key]: value } })
            }
          />
          <button
            className="primary"
            disabled={busy || storageBlocked}
            type="submit"
          >
            Review request
          </button>
        </form>
      )}
    </div>
  );
}
