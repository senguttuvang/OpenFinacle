"use client";

import { Effect } from "effect";
import { useEffect, useState } from "react";
import type { CustomerChoice } from "../src/domain/customer-registry";
import { api } from "./api";

export function CustomerPicker({
  busy,
  onSelect,
  onCancel,
}: {
  busy: boolean;
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<CustomerChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Effect.runPromise(
      api<{ customers: CustomerChoice[] }>("/customers").pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            if (active) setChoices(value.customers);
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (active) setError(failure.message);
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (active) setLoading(false);
          }),
        ),
      ),
    );
    return () => {
      active = false;
    };
  }, []);
  const filtered = choices.filter((choice) =>
    `${choice.display_name} ${choice.reference} ${choice.account_suffix}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <section aria-labelledby="customer-picker-title" className="panel">
      <h2 id="customer-picker-title">Choose an existing customer</h2>
      <p>Each synthetic customer has their own saved account and statement.</p>
      <label htmlFor="customer-search">
        Search name, reference or account suffix
      </label>
      <input
        id="customer-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      {loading && <p role="status">Loading registered customers…</p>}
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {!loading && !error && (
        <p role="status">{filtered.length} customers available</p>
      )}
      <ul aria-label="Registered customers" className="customer-choices">
        {filtered.map((choice) => (
          <li key={choice.id}>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => onSelect(choice.id)}
            >
              <span>
                <strong>{choice.display_name}</strong>
                <br />
                <small>
                  {choice.reference} · Account ending {choice.account_suffix}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!loading && !error && filtered.length === 0 && (
        <p>
          No matching registered customers. Change your search or ask the
          operator to prepare the directory.
        </p>
      )}
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={onCancel}
      >
        Back to journeys
      </button>
    </section>
  );
}
