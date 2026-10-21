"use client";

import { CheckCircle2, CircleHelp, Clock3, LockKeyhole, X } from "lucide-react";
import { followPortalLink } from "../../navigation/ui/portal-location";
import { retailPath, viewPaths } from "../../navigation/ui/portal-routes";
import { RetailUnavailable } from "../../navigation/ui/retail-navigation";
import type { WorkspaceContext } from "./use-banking-workspace";
import { WorkspaceHeading } from "./workspace-heading";
export function WorkspaceStatus({ context }: { context: WorkspaceContext }) {
  const {
    data,
    navigate,
    route,
    retailItem,
    view,
    setView,
    error,
    setError,
    toast,
    account,
  } = context;
  return (
    <>
      {view === "forbidden" && (
        <section className="retail-unavailable" aria-label="Screen access">
          <h1>{route?.title ?? "Unknown screen"}</h1>
          <p>
            This screen is not available for your current persona or banking
            journey. Opening a link does not change your role or selected
            customer.
          </p>
          <a
            href={viewPaths.overview}
            onClick={(event) =>
              followPortalLink(event, () => setView("overview"))
            }
          >
            Back to overview
          </a>
        </section>
      )}
      {view === "family" && route?.family && (
        <section className="retail-unavailable">
          <h1>{route.title}</h1>
          <p>Choose a service. Each link opens its own saved destination.</p>
          <ul>
            {route.family.items.map((item) => (
              <li key={item.id}>
                <a
                  href={retailPath(item)}
                  onClick={(event) =>
                    followPortalLink(event, () => navigate(retailPath(item)))
                  }
                >
                  {item.label}
                </a>
                {item.destination.kind === "unavailable"
                  ? " · Not available in demo"
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      {view === "unavailable" && retailItem && (
        <>
          <div className="page-heading">
            <h1>{retailItem.label}</h1>
          </div>
          <RetailUnavailable item={retailItem} navigate={setView} />
        </>
      )}
      <WorkspaceHeading context={context} />
      <p
        className="sync-caption"
        hidden={
          view === "unavailable" || view === "family" || view === "forbidden"
        }
      >
        <Clock3 size={13} />
        {data.core.stale ? "Refresh needed" : "Saved banking view"} · Last
        synced{" "}
        {data.core.syncedAt
          ? new Date(data.core.syncedAt).toLocaleString("en-IN")
          : "not available"}
      </p>
      {error && (
        <div className="notice error" role="alert">
          <CircleHelp size={18} />
          <span>{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div className="notice positive" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {(account?.subStatus?.blockDebit || account?.subStatus?.block) && (
        <div className="notice error" role="status">
          <LockKeyhole size={18} /> Debits are restricted on this account.
          Contact the bank officer to request release.
        </div>
      )}
    </>
  );
}
