"use client";

import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { BankingError } from "../src/domain/banking";
import {
  adviceBoundary,
  adviceFacts,
  DepositAdvice,
} from "../src/domain/deposit-advice";
import { api } from "./api";
import {
  fetchAdviceDownload,
  saveAdviceDownload,
} from "./deposit-advice-download";

type State =
  | { tag: "idle" | "loading" }
  | { tag: "error"; message: string }
  | { tag: "ready"; advice: DepositAdvice };
export function DepositAdvicePreview({
  bankId,
  id,
  kind,
  busy,
}: {
  bankId: string;
  id: string;
  kind: "fixed" | "recurring";
  busy: boolean;
}) {
  const [state, setState] = useState<State>({ tag: "idle" });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    if (state.tag === "ready") heading.current?.focus();
    if (state.tag === "idle" && returnFocus.current) {
      returnFocus.current = false;
      opener.current?.focus();
    }
  }, [state]);
  const path = `/deposit-advice?kind=${kind}&id=${encodeURIComponent(id)}`;
  const invalid = () =>
    new BankingError({
      message:
        "Opening advice could not be verified. Retry the preview or ask the service desk to inspect the holding.",
      status: 503,
    });
  const preview = () => {
    const current = ++request.current;
    setState({ tag: "loading" });
    setDownloadError("");
    void Effect.runPromise(
      api<unknown>(path).pipe(
        Effect.flatMap((value) =>
          Schema.decodeUnknown(DepositAdvice)(value).pipe(
            Effect.mapError(invalid),
          ),
        ),
        Effect.flatMap((advice) =>
          advice.bank_id === bankId &&
          advice.product_id === id &&
          advice.kind === kind &&
          advice.reference ===
            `${kind === "fixed" ? "FD" : "RD"}-${id.slice(0, 8).toUpperCase()}`
            ? Effect.succeed(advice)
            : Effect.fail(invalid()),
        ),
        Effect.tap((advice) =>
          Effect.sync(() => {
            if (request.current === current) setState({ tag: "ready", advice });
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (request.current === current)
              setState({ tag: "error", message: failure.message });
          }),
        ),
      ),
    );
  };
  const download = () => {
    if (state.tag !== "ready") return;
    const current = ++request.current;
    setDownloading(true);
    setDownloadError("");
    void Effect.runPromise(
      fetchAdviceDownload(path, state.advice).pipe(
        Effect.flatMap((text) =>
          Effect.try({
            try: () => {
              if (request.current === current)
                saveAdviceDownload(state.advice, text);
            },
            catch: () =>
              new BankingError({
                message:
                  "The file could not be saved. Check browser downloads and retry.",
                status: 503,
              }),
          }),
        ),
        Effect.catchAll((failure) =>
          Effect.sync(() => {
            if (request.current === current) setDownloadError(failure.message);
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (request.current === current) setDownloading(false);
          }),
        ),
      ),
    );
  };
  return (
    <section
      className="deposit-advice"
      aria-label="Demo opening advice"
      aria-busy={state.tag === "loading"}
    >
      {state.tag === "ready" ? (
        <>
          <h4 ref={heading} tabIndex={-1}>
            Demo opening advice · {state.advice.reference}
          </h4>
          <p>{adviceBoundary}</p>
          <dl className="detail-grid deposit-facts">
            {adviceFacts(state.advice).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            Original activation facts only. The illustration assumes the planned
            allocations; no accrued or credited earnings are certified. Current
            recurring progress remains in the holding view.
          </p>
          {downloadError && (
            <p role="alert" className="error-banner">
              {downloadError}
            </p>
          )}
          <div className="card-actions">
            <button
              type="button"
              disabled={busy || downloading}
              onClick={download}
            >
              {downloading
                ? "Verifying advice download…"
                : "Download demo opening advice (.txt)"}
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={() => {
                returnFocus.current = true;
                setState({ tag: "idle" });
              }}
            >
              Close opening advice
            </button>
          </div>
        </>
      ) : (
        <>
          {state.tag === "error" && (
            <p role="alert" className="error-banner">
              {state.message}
            </p>
          )}
          <button
            ref={opener}
            type="button"
            disabled={busy || state.tag === "loading"}
            onClick={preview}
          >
            {state.tag === "loading"
              ? "Loading opening advice…"
              : state.tag === "error"
                ? "Retry opening advice"
                : "View demo opening advice"}
          </button>
        </>
      )}
    </section>
  );
}
