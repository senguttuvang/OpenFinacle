"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Effect } from "effect";
import { useState } from "react";
import { isProfileMaintenance } from "../src/domain/profile-effects";
import type { CaseAction, CaseDetail } from "../src/domain/service-cases";
import type { ServiceDefinition } from "../src/domain/services";
import { validateServiceFields } from "../src/domain/services";
import { serviceCaseApi } from "./service-case-api";
import { ServiceFields, type ServicePerform } from "./service-request-form";

export const serviceStatus = (value: string) =>
  ({
    open: "Received",
    in_progress: "Being processed",
    needs_information: "More information needed",
    awaiting_approval: "Awaiting independent review",
    fulfilled: "Completed",
    rejected: "Declined",
    cancelled: "Cancelled",
    none: "No delivery",
    pending: "Not yet dispatched",
    dispatched: "Dispatched",
    ready_for_collection: "Ready for collection",
    delivered: "Delivered",
    not_recorded: "Delivery not recorded",
  })[value] ?? value.replaceAll("_", " ");
export const serviceReference = (id: string) =>
  `SR-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const timestamp = (value: string) => {
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "Time not recorded";
};
const actionLabels: Record<CaseAction, string> = {
  start: "Start processing",
  request_information: "Request more information",
  provide_information: "Provide information",
  submit_for_approval: "Send for approval",
  fulfil: "Record completion",
  return_for_review: "Return to officer",
  reject: "Decline request",
  cancel: "Cancel request",
  record_delivery: "Record delivery received",
};
const savedFields = (value: string): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed &&
      typeof parsed === "object" &&
      Object.values(parsed).every((item) => typeof item === "string")
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

export function ServiceCaseDetail({
  initial,
  definition,
  busy,
  perform,
  changed,
}: {
  initial: CaseDetail;
  definition?: ServiceDefinition;
  busy: boolean;
  perform: ServicePerform;
  changed: () => void;
}) {
  const [detail, setDetail] = useState(initial);
  const [action, setAction] = useState<CaseAction | "">("");
  const [fields, setFields] = useState(savedFields(initial.request.payload));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [reconcile, setReconcile] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const record = detail.request;
  const refresh = () =>
    perform(
      serviceCaseApi(`/service-cases?id=${encodeURIComponent(record.id)}`).pipe(
        Effect.tap((next) =>
          Effect.sync(() => {
            setDetail(next);
            setFields(savedFields(next.request.payload));
            setReconcile(false);
            setConfirm(false);
            setAction("");
            setNote("");
            setError("");
            changed();
          }),
        ),
        Effect.tapError((failure) =>
          Effect.sync(() => setError(failure.message)),
        ),
      ),
      "Request history refreshed.",
      false,
    );
  const submit = () => {
    if (!action) return;
    setError("");
    perform(
      serviceCaseApi("/service-cases/action", {
        id: record.id,
        version: record.version,
        action,
        note,
        ...(action === "provide_information" ? { fields } : {}),
      }).pipe(
        Effect.tap((next) =>
          Effect.sync(() => {
            setDetail(next);
            setAction("");
            setConfirm(false);
            setNote("");
            changed();
          }),
        ),
        Effect.tapError((failure) =>
          Effect.sync(() => {
            setError(failure.message);
            if (failure.status === 409 || failure.status >= 500)
              setReconcile(true);
          }),
        ),
      ),
      "Case action recorded.",
    );
  };
  return (
    <div className="centre-case" aria-busy={busy}>
      <div className="centre-case-heading">
        <code>{serviceReference(record.id)}</code>
        <span className={`centre-status centre-status-${record.status}`}>
          {serviceStatus(record.status)}
        </span>
      </div>
      <h3>{definition?.title ?? record.kind.replaceAll("_", " ")}</h3>
      <p className="centre-note">
        {isProfileMaintenance(record.kind)
          ? record.status === "fulfilled"
            ? record.profile_patch
              ? "This approved change updated the saved synthetic customer profile. Account balances and Fineract records are unchanged."
              : "This earlier case has no recorded profile effect. Its history is preserved and has not been replayed."
            : "Independent approval updates the saved synthetic customer profile. Account balances and Fineract records are unchanged."
          : "Simulated service fulfilment. Account balances and product records are not changed by these case actions."}
      </p>
      <dl className="centre-summary">
        <div>
          <dt>Submitted</dt>
          <dd>{timestamp(record.created_at)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{timestamp(record.updated_at)}</dd>
        </div>
        {record.delivery_status !== "none" && (
          <div>
            <dt>Delivery</dt>
            <dd>{serviceStatus(record.delivery_status)}</dd>
          </div>
        )}
      </dl>
      <h3>Current request details</h3>
      <p className="centre-preserve">{record.detail}</p>
      {error && (
        <p role="alert" className="centre-error">
          {error}
        </p>
      )}
      {reconcile ? (
        <div className="centre-reconcile">
          <p>
            This request may have changed. Refresh and review its history before
            another action.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={refresh}
          >
            Refresh request history
          </button>
        </div>
      ) : detail.actions.length > 0 ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            const validation =
              action === "provide_information" && definition
                ? validateServiceFields(definition, fields)
                : Effect.succeed(fields);
            void Effect.runPromise(
              validation.pipe(
                Effect.tap((normalized) =>
                  Effect.sync(() => {
                    setFields(normalized);
                    setConfirm(true);
                  }),
                ),
                Effect.catchAll((failure) =>
                  Effect.sync(() => setError(failure.message)),
                ),
              ),
            );
          }}
        >
          <fieldset disabled={busy} className="centre-action-form">
            <legend>Next action</legend>
            {confirm ? (
              <AlertDialog.Root
                open={confirm}
                onOpenChange={(value) => {
                  if (!busy) setConfirm(value);
                }}
              >
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="centre-overlay centre-confirm-overlay" />
                  <AlertDialog.Content
                    className="centre-dialog centre-confirm-dialog"
                    aria-busy={busy}
                    onEscapeKeyDown={(event) => {
                      if (busy) event.preventDefault();
                    }}
                  >
                    <AlertDialog.Title>
                      {action ? actionLabels[action] : "Confirm case action"}
                    </AlertDialog.Title>
                    <AlertDialog.Description>
                      This action will be recorded in the request history.
                      Review the details before confirming.
                    </AlertDialog.Description>
                    {error && (
                      <p className="centre-error" role="alert">
                        {error}
                      </p>
                    )}
                    {action === "provide_information" && definition && (
                      <dl className="centre-summary">
                        {definition.fields.map((field) => (
                          <div key={field.key}>
                            <dt>{field.label}</dt>
                            <dd>{fields[field.key]}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <p className="centre-preserve">
                      {note || "No additional note."}
                    </p>
                    <div className="centre-actions">
                      <AlertDialog.Cancel asChild>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setConfirm(false)}
                          disabled={busy}
                        >
                          Back to action
                        </button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={(event) => {
                            event.preventDefault();
                            submit();
                          }}
                        >
                          {busy ? "Recording…" : "Confirm action"}
                        </button>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            ) : (
              <>
                <label>
                  Action
                  <select
                    required
                    value={action}
                    onChange={(event) => {
                      setAction(event.target.value as CaseAction);
                      setError("");
                    }}
                  >
                    <option value="">Select an action</option>
                    {detail.actions.map((item) => (
                      <option value={item} key={item}>
                        {actionLabels[item]}
                      </option>
                    ))}
                  </select>
                </label>
                {action === "provide_information" && definition && (
                  <ServiceFields
                    definition={definition}
                    values={fields}
                    disabled={busy}
                    onChange={(key, value) =>
                      setFields({ ...fields, [key]: value })
                    }
                  />
                )}
                <label>
                  Case note
                  {["start", "submit_for_approval", "record_delivery"].includes(
                    action,
                  )
                    ? " (optional)"
                    : " (at least 5 characters)"}
                  <textarea
                    maxLength={500}
                    minLength={
                      [
                        "start",
                        "submit_for_approval",
                        "record_delivery",
                      ].includes(action)
                        ? undefined
                        : 5
                    }
                    required={
                      ![
                        "start",
                        "submit_for_approval",
                        "record_delivery",
                      ].includes(action)
                    }
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                <button type="submit" className="primary" disabled={!action}>
                  Review action
                </button>
              </>
            )}
          </fieldset>
        </form>
      ) : (
        <p className="centre-note">
          No action is available for this role and request state. Refresh to
          check for updates from the service desk.
        </p>
      )}
      {!reconcile && (
        <button
          type="button"
          className="text-link"
          disabled={busy}
          onClick={refresh}
        >
          Refresh request history
        </button>
      )}
      <section aria-label="Request history">
        <h3>Request history</h3>
        <ol className="centre-timeline">
          {detail.history.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{serviceStatus(event.to_status)}</strong>
                <small>
                  {timestamp(event.created_at)} ·{" "}
                  {event.actor.replaceAll("_", " ")}
                </small>
              </div>
              <p>{event.note}</p>
              {event.delivery_status !== "none" && (
                <small>Delivery: {serviceStatus(event.delivery_status)}</small>
              )}
              <details>
                <summary>Details at this step</summary>
                <p className="centre-preserve">{event.detail}</p>
              </details>
            </li>
          ))}
        </ol>
        {!detail.history.length && (
          <p>Earlier processing history is unavailable.</p>
        )}
      </section>
    </div>
  );
}
