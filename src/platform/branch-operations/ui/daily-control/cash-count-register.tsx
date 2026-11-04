"use client";
import { useState } from "react";
import {
  formatMoney,
  type Role,
} from "../../../banking-workspace/domain/banking";
import {
  type CashCountAction,
  type CashCountDetail,
  cashDenominations,
  countActions,
} from "../../domain/cash-counts";
import type { PendingCount } from "./count-api";
import { CountQuantities, quantityValues } from "./count-quantities";
import { useCashCounts } from "./use-cash-counts";

function CountHistory({
  detail,
  role,
  disabled,
  save,
}: {
  detail: CashCountDetail;
  role: Role;
  disabled: boolean;
  save: (request: PendingCount) => void;
}) {
  const [action, setAction] = useState<CashCountAction["action"] | "">("");
  const [note, setNote] = useState("");
  const [values, setValues] = useState(() =>
    cashDenominations.map((d) =>
      String(
        detail.record.snapshot.quantities.find((r) => r.denominationMinor === d)
          ?.quantity ?? "",
      ),
    ),
  );
  const { record } = detail;
  const actions = detail.actions.filter((a) =>
    countActions(record, role).includes(a),
  );
  const rows = quantityValues(values);
  return (
    <article className="branch-day-item" aria-label="Saved count detail">
      <h5>
        {record.snapshot.label} · {record.snapshot.boxType}
      </h5>
      <p>
        Count {record.countId} · {record.snapshot.countDate} IST reported count
        date
      </p>
      <p>
        Latest saved state: <strong>{record.status}</strong> · version{" "}
        {record.version} · declared{" "}
        {formatMoney(record.snapshot.totalMinor / 100)}
      </p>
      {!detail.historyComplete && (
        <p role="alert">
          Only the first 200 history events are loaded. Latest state is shown
          separately; further changes are withheld.
        </p>
      )}
      <details>
        <summary>
          Saved declaration history · {detail.history.length} events
        </summary>
        {detail.history.map((event) => (
          <section key={event.id} className="branch-day-item">
            <h6>
              Version {event.version} · {event.action} · {event.status}
            </h6>
            <p>
              {event.actor} demo role · {event.createdAt} · original reference{" "}
              {event.key}
            </p>
            <p>{event.note}</p>
            <p>
              Declared total {formatMoney(event.snapshot.totalMinor / 100)} ·
              synthetic declaration · INR
            </p>
            <ul>
              {event.snapshot.quantities.map((row) => (
                <li key={row.denominationMinor}>
                  {formatMoney(row.denominationMinor / 100)} × {row.quantity}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </details>
      {actions.length ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !action ||
              !actions.includes(action) ||
              !note.trim() ||
              (action === "resubmit" && !rows)
            )
              return;
            save({
              key: crypto.randomUUID(),
              kind: "action",
              command:
                action === "resubmit" && rows
                  ? {
                      id: record.countId,
                      version: record.version,
                      action,
                      note,
                      quantities: rows,
                    }
                  : {
                      id: record.countId,
                      version: record.version,
                      action: action as "review" | "return" | "withdraw",
                      note,
                    },
            });
          }}
        >
          <fieldset disabled={disabled}>
            <legend>Act on saved version {record.version}</legend>
            <label>
              Count action
              <select
                required
                value={action}
                onChange={(e) => setAction(e.target.value as typeof action)}
              >
                <option value="">Choose action</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            {action === "resubmit" && (
              <CountQuantities
                values={values}
                change={setValues}
                disabled={disabled}
              />
            )}
            <label>
              Count action note
              <input
                required
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={
                !action || !note.trim() || (action === "resubmit" && !rows)
              }
            >
              Save count action
            </button>
            <p>
              Review records the approver demo role’s review of a declaration.
              It does not verify physical cash or establish independent staff
              identity.
            </p>
          </fieldset>
        </form>
      ) : (
        <p>
          No count actions available to the current demo role in this saved
          state.
        </p>
      )}
    </article>
  );
}

export function CashCountRegister({
  customerId,
  branchId,
  role,
  businessDate,
  reviewFixture,
}: {
  customerId: string;
  branchId: string;
  role: Role;
  businessDate: string;
  reviewFixture: boolean;
}) {
  const model = useCashCounts(customerId, branchId, role);
  const [showForm, setShowForm] = useState(false),
    [boxType, setBoxType] = useState<"teller" | "vault">("teller"),
    [label, setLabel] = useState(""),
    [date, setDate] = useState(businessDate),
    [note, setNote] = useState("");
  const [values, setValues] = useState(() => cashDenominations.map(() => ""));
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all");
  const rows = quantityValues(values);
  const disabled =
    model.busy ||
    !!model.pending ||
    model.blocked ||
    reviewFixture ||
    !customerId;
  const records = model.list?.records.filter(
    (e) =>
      (status === "all" || e.status === status) &&
      `${e.snapshot.label} ${e.snapshot.boxType} ${e.countId} ${e.snapshot.countDate}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section aria-label="Synthetic cash-count register">
      <h4>Teller and vault count declarations</h4>
      <p>
        Saved synthetic declarations · {branchId} · INR. No Core cash balance,
        cash variance, ledger posting, physical verification, handover,
        settlement or branch-close proof is created. Supported denomination
        slots are a demo input set.
      </p>
      {reviewFixture ? (
        <p>
          Count reads and changes are unavailable in the static review fixture.
        </p>
      ) : (
        <button
          type="button"
          disabled={model.busy || !customerId}
          onClick={model.refresh}
        >
          Read cash-count register
        </button>
      )}
      {model.message && <p role="status">{model.message}</p>}
      {model.busy && <p role="status">Reading or saving count workflow…</p>}
      {model.pending && (
        <aside className="branch-day-item" aria-label="Original count recovery">
          <h5>Original count request awaits confirmation</h5>
          <p>
            Reference {model.pending.key} ·{" "}
            {model.pending.kind === "declare"
              ? "declare"
              : model.pending.command.action}
            . The request is retained in this tab for {role}. No automatic
            replay occurs.
          </p>
          <p>
            A missing record at one read does not prove the save failed. Inspect
            first; retry preserves the exact original request and reference.
          </p>
          <button type="button" disabled={model.busy} onClick={model.inspect}>
            Inspect original count reference
          </button>
          <button type="button" disabled={model.busy} onClick={model.retry}>
            Retry original count request
          </button>
        </aside>
      )}
      {model.list && (
        <>
          <p>
            Workflow read{" "}
            {new Date(model.list.observedAt).toLocaleString("en-IN")} · latest{" "}
            {model.list.records.length} declarations · limit {model.list.limit}.
            This read does not refresh the financial observation above.
          </p>
          {model.list.limited && (
            <p role="alert">
              More than 100 declarations exist. This list is incomplete and
              cannot establish that all count work is listed.
            </p>
          )}
          <label>
            Search loaded cash counts
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label>
            Cash count status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All loaded states</option>
              {["submitted", "returned", "reviewed", "withdrawn"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <p>
            {records?.length} of {model.list.records.length} loaded declarations
            match.
          </p>
          {records?.map((e) => (
            <p key={e.countId}>
              <button
                type="button"
                disabled={model.busy}
                onClick={() => model.open(e.countId)}
              >
                {e.snapshot.label} · {e.snapshot.boxType} · {e.status} ·{" "}
                {e.snapshot.countDate} · declared{" "}
                {formatMoney(e.snapshot.totalMinor / 100)}
              </button>
            </p>
          ))}
          {!records?.length && (
            <p>
              No matching declarations in the loaded scope. Cash and close
              controls remain unverified.
            </p>
          )}
        </>
      )}
      {model.detail && (
        <CountHistory
          key={`${model.detail.record.countId}-${model.detail.record.version}`}
          detail={model.detail}
          role={role}
          disabled={disabled}
          save={model.save}
        />
      )}
      {role === "officer" && (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Hide count declaration form" : "New count declaration"}
          </button>
          {showForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (disabled || !rows || !label.trim() || !note.trim()) return;
                setShowForm(false);
                model.save({
                  key: crypto.randomUUID(),
                  kind: "declare",
                  command: {
                    boxType,
                    label: label.trim(),
                    countDate: date,
                    quantities: rows,
                    note: note.trim(),
                  },
                });
              }}
            >
              <fieldset disabled={disabled}>
                <legend>Declare a synthetic count</legend>
                <label>
                  Count box type
                  <select
                    value={boxType}
                    onChange={(e) =>
                      setBoxType(e.target.value as typeof boxType)
                    }
                  >
                    <option value="teller">Teller</option>
                    <option value="vault">Vault</option>
                  </select>
                </label>
                <label>
                  Count box label
                  <input
                    required
                    maxLength={80}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
                <label>
                  Reported count date (IST)
                  <input
                    type="date"
                    required
                    max={businessDate}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <CountQuantities
                  values={values}
                  change={setValues}
                  disabled={disabled}
                />
                <label>
                  Declaration note
                  <input
                    required
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={!rows || !label.trim() || !note.trim()}
                >
                  Submit count declaration
                </button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
