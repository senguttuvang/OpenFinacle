"use client";
import { Effect, Schema } from "effect";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../banking-workspace/ui/api";
import { SavingsStatement } from "../../domain/savings-statement";
import { statementCsv } from "../../domain/statement-csv";

export function useStatementExport() {
  const active = useRef(true),
    generation = useRef(0),
    busy = useRef(false);
  const [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
    };
  }, []);
  const invalidate = () => {
    generation.current++;
    busy.current = false;
    setExporting(false);
    setNotice("");
  };
  const download = async (source: SavingsStatement) => {
    if (busy.current || source.total > 5000) return;
    const ownGeneration = ++generation.current;
    busy.current = true;
    setExporting(true);
    setNotice("");
    const parameters = new URLSearchParams({
      customerId: source.customerId,
      mode: "export",
      page: "0",
    });
    if (source.query.from) parameters.set("from", source.query.from);
    if (source.query.to) parameters.set("to", source.query.to);
    try {
      const value = await Effect.runPromise(
        api<unknown>(`/branch/savings-statement?${parameters}`).pipe(
          Effect.flatMap((v) =>
            Schema.decodeUnknown(SavingsStatement)(v).pipe(
              Effect.mapError(
                () =>
                  new Error("Export evidence is invalid. No CSV was produced."),
              ),
            ),
          ),
          Effect.filterOrFail(
            (v) =>
              v.query.mode === "export" &&
              v.query.page === 0 &&
              v.branchId === source.branchId &&
              v.customerId === source.customerId &&
              v.account.id === source.account.id &&
              v.account.clientId === source.account.clientId &&
              v.account.accountNo === source.account.accountNo &&
              v.query.from === source.query.from &&
              v.query.to === source.query.to,
            () =>
              new Error(
                "Export scope or native dates changed. No CSV was produced.",
              ),
          ),
        ),
      );
      if (!active.current || ownGeneration !== generation.current) return;
      const csv = statementCsv(value);
      if (csv === null)
        throw new Error(
          "Complete-range export evidence is invalid. No CSV was produced.",
        );
      const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = `openfinacle-savings-${value.account.id}-${value.query.from ?? "all"}-${value.query.to ?? "all"}-${value.observedAt}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(
        `Exported ${value.rows.length} of ${value.total} native matches. Separate export read: ${new Date(value.startedAt).toISOString()} to ${new Date(value.observedAt).toISOString()}. Parent financial observation is unchanged.`,
      );
    } catch (error) {
      if (active.current && ownGeneration === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Export is unavailable. No CSV was produced.",
        );
    } finally {
      if (active.current && ownGeneration === generation.current) {
        busy.current = false;
        setExporting(false);
      }
    }
  };
  return { exporting, notice, invalidate, download };
}
