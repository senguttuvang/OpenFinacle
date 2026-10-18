"use client";

import { Effect } from "effect";
import { ChevronRight, Landmark, RefreshCw, ShieldCheck } from "lucide-react";
import { CommandMenu } from "../../navigation/ui/command-menu";
import { api, setApiCustomerScope } from "./api";
import type { WorkspaceContext } from "./use-banking-workspace";
import { roles } from "./workspace-presentation";
export function WorkspaceHeader({ context }: { context: WorkspaceContext }) {
  const {
    resetWorkspace,
    data,
    setView,
    busy,
    setSearch,
    load,
    perform,
    role,
    staff,
    retail,
    account,
    viewTitle,
  } = context;
  return (
    <header className="topbar">
      {retail && (
        <a className="brand retail-brand" href="/">
          <span className="brand-symbol">
            <Landmark size={24} />
          </span>
          OpenFinacle<span className="brand-dot">.</span>
          <small>PERSONAL BANKING</small>
        </a>
      )}
      <div className="breadcrumb">
        {staff ? "Branch banking" : "Personal banking"}
        <ChevronRight size={14} />
        <strong>{viewTitle}</strong>
      </div>
      <div className="topbar-right">
        <CommandMenu
          role={role}
          journey={data.bank.journey}
          busy={busy}
          navigate={(destination) => {
            setView(destination);
            setSearch("");
          }}
        />
        <span className="sandbox-label">
          <ShieldCheck size={14} /> Demo environment
        </span>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh workspace"
          disabled={busy}
          onClick={() =>
            perform(load(true), "Balances synchronized with Fineract.", false)
          }
        >
          <RefreshCw size={18} />
        </button>
        <button
          className="secondary customer-switch"
          type="button"
          disabled={busy}
          onClick={() =>
            perform(
              api("/session/end", {}).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    setApiCustomerScope(null);
                    resetWorkspace(true);
                  }),
                ),
              ),
              "Choose a customer.",
              false,
            )
          }
        >
          Switch customer
        </button>
        <div className="person">
          <span className="avatar">
            {staff
              ? roles[role].initials
              : (account?.clientName ?? "Customer")
                  .split(/\s+/)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
          </span>
          <div>
            <strong>
              {staff
                ? role === "officer"
                  ? "Priya Rao"
                  : "Dev Sharma"
                : (account?.clientName ??
                  data.application?.name ??
                  "Demonstration customer")}
            </strong>
            <small>{roles[role].name}</small>
          </div>
        </div>
      </div>
    </header>
  );
}
