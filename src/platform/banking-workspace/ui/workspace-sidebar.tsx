"use client";

import { Effect } from "effect";
import {
  ArrowLeftRight,
  ArrowRight,
  CreditCard,
  FileCheck2,
  FileText,
  Landmark,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { PersonaSelect } from "../../navigation/ui/persona-select";
import { followPortalLink } from "../../navigation/ui/portal-location";
import { retailPath, viewPaths } from "../../navigation/ui/portal-routes";
import { RetailNavigation } from "../../navigation/ui/retail-navigation";
import { api, setApiCustomerScope } from "./api";
import type { WorkspaceContext } from "./use-banking-workspace";
import { navIcons, roles } from "./workspace-presentation";
export function WorkspaceSidebar({ context }: { context: WorkspaceContext }) {
  const {
    resetWorkspace,
    data,
    setData,
    navigate,
    retailItem,
    view,
    setView,
    busy,
    setSearch,
    setServiceSearch,
    perform,
    changeRole,
    role,
    staff,
    retail,
    pending,
    navigation,
  } = context;
  return (
    <aside className="sidebar">
      <a className="brand" href="/">
        <span className="brand-symbol">
          <Landmark size={22} />
        </span>
        OpenFinacle<span className="brand-dot">.</span>
      </a>
      <div className="workspace-label">
        {staff ? "BRANCH WORKSPACE" : "PERSONAL BANKING"}
        <span>DEMO</span>
      </div>
      {!retail && (
        <nav aria-label="Main navigation">
          {navigation.map(({ view: item, label, alias }) => {
            const Icon = navIcons[item];
            return (
              <a
                href={viewPaths[item]}
                className={view === item ? "nav-item active" : "nav-item"}
                aria-current={view === item ? "page" : undefined}
                aria-label={label}
                key={item}
                onClick={(event) =>
                  followPortalLink(event, () => {
                    setView(item);
                    setSearch("");
                  })
                }
              >
                <Icon size={19} />
                <span>{label}</span>
                {alias && <kbd className="nav-code">{alias}</kbd>}
                {item === "approvals" && pending.length > 0 && (
                  <b>{pending.length}</b>
                )}
                {item === "application" &&
                  data.application?.status === "awaiting_approval" && (
                    <span className="nav-dot" />
                  )}
              </a>
            );
          })}
        </nav>
      )}
      {retail && (
        <RetailNavigation
          label="Banking navigation"
          view={
            view === "unavailable" || view === "family" || view === "forbidden"
              ? "overview"
              : view
          }
          activeItemId={retailItem?.id}
          onFamily={navigate}
          busy={busy}
          onSelect={(item) => {
            setSearch("");
            setServiceSearch("");
            navigate(retailPath(item));
          }}
        />
      )}
      {retail && (
        <div className="retail-shortcuts">
          <h2>Quick services</h2>
          <a
            href={viewPaths.statements}
            onClick={(event) =>
              followPortalLink(event, () => setView("statements"))
            }
          >
            <FileText size={17} />
            Account statement
          </a>
          <a
            href={viewPaths.transfer}
            onClick={(event) =>
              followPortalLink(event, () => setView("transfer"))
            }
          >
            <ArrowLeftRight size={17} />
            Fund transfer
          </a>
          <a
            href="/customer-service/debit-card"
            onClick={(event) =>
              followPortalLink(event, () => {
                setServiceSearch("");
                navigate("/customer-service/debit-card");
              })
            }
          >
            <CreditCard size={17} />
            Request a debit card
          </a>
          <a
            href="/customer-service/chequebook"
            onClick={(event) =>
              followPortalLink(event, () => {
                setServiceSearch("");
                navigate("/customer-service/chequebook");
              })
            }
          >
            <FileCheck2 size={17} />
            Request a chequebook
          </a>
          <a
            href="/customer-service/address"
            onClick={(event) =>
              followPortalLink(event, () => {
                setServiceSearch("");
                navigate("/customer-service/address");
              })
            }
          >
            <Users size={17} />
            Update address
          </a>
          <div className="retail-shortcuts-note">
            <ShieldCheck size={21} />
            <strong>Bank with confidence</strong>
            <p>OpenFinacle is a demo. Use only the sample customer details.</p>
          </div>
        </div>
      )}
      <div className="sidebar-bottom">
        <div className="demo-help">
          <Sparkles size={19} />
          <strong>Experience both sides</strong>
          <p>Switch roles to follow a customer's journey through the bank.</p>
          <PersonaSelect
            value={role}
            disabled={busy}
            options={roles}
            onChange={changeRole}
          />
        </div>
        <div className="core-status">
          <span />{" "}
          {data.core.stale
            ? "Balances need a refresh"
            : "Core-backed demo data"}
          <small>
            Last synced{" "}
            {data.core.syncedAt
              ? new Date(data.core.syncedAt).toLocaleString("en-IN")
              : "before this session"}
          </small>
        </div>
        <button
          type="button"
          className="journey-switch"
          disabled={busy}
          onClick={() =>
            perform(
              api("/session/end", {}).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    setData(null);
                    setView("overview");
                    setApiCustomerScope(null);
                    resetWorkspace();
                  }),
                ),
              ),
              "Choose a new demo journey.",
              false,
            )
          }
        >
          Choose another journey <ArrowRight size={13} />
        </button>
      </div>
    </aside>
  );
}
