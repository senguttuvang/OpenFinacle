"use client";

import { Effect, Schema } from "effect";
import { useEffect, useState } from "react";
import type { Dashboard } from "../../banking-workspace/domain/view";
import { api } from "../../banking-workspace/ui/api";
import type { View } from "../../navigation/ui/navigation";
import { type BranchDay, branchTotals } from "../domain/branch-day";
import { BranchDayEnvelope } from "../domain/core-account";
import { AccountingExplorer } from "./accounting-explorer";
import type { BranchMutation } from "./branch-day-actions";
import {
  BranchSummary,
  CustomerDirectory,
  DailyControl,
} from "./branch-day-queues";
import { BranchAccountDetail, InstructionDetail } from "./branch-day-records";

const tabs = [
  "Overview",
  "Customers",
  "Account",
  "Transactions & approvals",
  "Accounting",
  "Daily control",
] as const;
type Tab = (typeof tabs)[number];
export function BranchDayWorkspace({
  data,
  navigate,
}: {
  data: Dashboard;
  navigate: (view: View) => void;
}) {
  const [day, setDay] = useState<BranchDay | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [customerId, setCustomerId] = useState("");
  const [commandId, setCommandId] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewpoint, setViewpoint] = useState("manager");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setDay(null);
    Effect.runPromise(
      api<BranchDay>(`/branch?revision=${revision}`).pipe(
        Effect.flatMap((value) =>
          Schema.decodeUnknown(BranchDayEnvelope)(value).pipe(
            Effect.as(value),
            Effect.mapError(
              () =>
                new Error(
                  "Branch response is incomplete or invalid. Refresh or return to selected customer servicing.",
                ),
            ),
          ),
        ),
      ),
    )
      .then((value) => {
        if (active) {
          setDay(value);
          setCustomerId((id) =>
            value.relationships.some((r) => r.customer.id === id)
              ? id
              : (value.relationships[0]?.customer.id ?? ""),
          );
        }
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const relationship = day?.relationships.find(
    (r) => r.customer.id === customerId,
  );
  const openCustomer = (id: string) => {
    setCustomerId(id);
    setCommandId("");
    setTab("Account");
  };
  const openCommand = (id: string, customer: string) => {
    setCustomerId(customer);
    setCommandId(id);
    setTab("Transactions & approvals");
  };
  const mutate: BranchMutation = async (
    path: string,
    body: unknown,
    key?: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await Effect.runPromise(api(path, body, key));
      setNotice(
        "Workflow response saved. Review the refreshed record before any further action.",
      );
      setRevision((r) => r + 1);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Outcome unconfirmed. Refresh and inspect before retrying.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="branch-day">
      <header className="panel branch-day-heading">
        <div>
          <span className="eyebrow">
            Branch operations · synthetic demonstration
          </span>
          <h2>One branch day</h2>
          <p>
            Servicing branch: {day?.branchId ?? "Loading"} · Business date:{" "}
            {day?.businessDate ?? data.businessDate} · INR
          </p>
          <p>
            Source:{" "}
            {day?.reviewFixture
              ? "STATIC REVIEW FIXTURE — invented values; no core effects"
              : "Apache Fineract + application workflows"}{" "}
            · Observed{" "}
            {day ? new Date(day.observedAt).toLocaleString("en-IN") : "pending"}
            . Reads are not an atomic branch snapshot.
          </p>
        </div>
        <label>
          Work viewpoint
          <select
            value={viewpoint}
            onChange={(e) => {
              setViewpoint(e.target.value);
              setTab(
                e.target.value === "accountant"
                  ? "Accounting"
                  : e.target.value === "checker"
                    ? "Transactions & approvals"
                    : e.target.value === "teller"
                      ? "Account"
                      : "Overview",
              );
            }}
          >
            <option value="teller">Teller</option>
            <option value="checker">Checker</option>
            <option value="manager">Branch manager</option>
            <option value="accountant">Accountant</option>
          </select>
        </label>
        <p>
          Viewpoint organises work only. Current authority:{" "}
          <strong>{data.role}</strong> demo persona. Independent production
          staff identity is not configured.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => setRevision((r) => r + 1)}
        >
          Refresh branch records
        </button>
      </header>
      <nav aria-label="Branch day screens" className="branch-day-tabs">
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            aria-current={tab === item ? "page" : undefined}
            onClick={() => {
              setTab(item);
              if (item === "Transactions & approvals") setCommandId("");
            }}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Reading or updating branch records…</p>}
      {day && (
        <>
          {day.truncated && (
            <p role="alert">
              Only the first 100 registered relationships are loaded. Branch
              totals and close readiness are incomplete.
            </p>
          )}
          {tab === "Overview" && (
            <BranchSummary
              day={day}
              totals={branchTotals(day)}
              openCustomer={openCustomer}
              openCommand={openCommand}
              daily={() => setTab("Daily control")}
            />
          )}
          {tab === "Customers" && (
            <CustomerDirectory day={day} openCustomer={openCustomer} />
          )}
          {tab === "Account" &&
            (relationship ? (
              <BranchAccountDetail
                key={relationship.customer.id}
                relationship={relationship}
                role={data.role}
                busy={busy}
                mutate={mutate}
                openCommand={openCommand}
                accounting={() => setTab("Accounting")}
              />
            ) : (
              <p>Choose a registered customer in Customers.</p>
            ))}
          {tab === "Transactions & approvals" && (
            <InstructionDetail
              day={day}
              customerId={customerId}
              commandId={commandId}
              openCommand={openCommand}
              role={data.role}
              busy={busy}
              mutate={mutate}
              accounting={() => setTab("Accounting")}
            />
          )}
          {tab === "Accounting" &&
            (relationship ? (
              <AccountingExplorer
                key={`${customerId}-${revision}`}
                relationship={relationship}
                businessDate={day.businessDate}
                openCommand={openCommand}
              />
            ) : (
              <p>Choose a customer first.</p>
            ))}
          {tab === "Daily control" && (
            <DailyControl
              day={day}
              busy={busy}
              mutate={mutate}
              openCommand={openCommand}
            />
          )}
        </>
      )}
      <section className="panel">
        <h3>Continue selected relationship servicing</h3>
        <p>
          Existing screens below operate on the header’s selected customer,
          independently of the branch enquiry selection above.
        </p>
        <div className="branch-day-actions">
          <button type="button" onClick={() => navigate("cash")}>
            Selected customer cash desk
          </button>
          <button type="button" onClick={() => navigate("services")}>
            Service centre
          </button>
          <button type="button" onClick={() => navigate("application")}>
            Account opening
          </button>
        </div>
      </section>
    </div>
  );
}
