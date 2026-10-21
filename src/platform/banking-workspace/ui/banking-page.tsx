"use client";

import { Clock3, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { CustomerOnboarding } from "../../account-opening/ui/customer-onboarding";
import { BranchOverview } from "../../branch-operations/ui/branch-overview";
import { viewLabels as labels } from "../../navigation/ui/navigation";
import { followPortalLink } from "../../navigation/ui/portal-location";
import { viewPaths } from "../../navigation/ui/portal-routes";
import { ServiceCentre } from "../../service-requests/ui/service-centre";
import { RetailAccount, RetailOverview } from "./retail-overview";
import { ApplicationScreen } from "./screens/application-screen";
import { ApprovalsScreen } from "./screens/approvals-screen";
import { CashScreen } from "./screens/cash-screen";
import { OperationsScreen } from "./screens/operations-screen";
import { OverviewScreen } from "./screens/overview-screen";
import { StatementsScreen } from "./screens/statements-screen";
import { TransferScreen } from "./screens/transfer-screen";
import { useBankingWorkspace } from "./use-banking-workspace";
import { WorkspaceHeader } from "./workspace-header";
import {
  Cards,
  Deposits,
  Loans,
  navIcons,
  Planning,
  RetailProfile,
} from "./workspace-presentation";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceStatus } from "./workspace-status";
export default function Page() {
  const [entry, setEntry] = useState({
    version: 0,
    picker: false,
    fresh: false,
  });
  return (
    <BankingPage
      key={entry.version}
      initialPicker={entry.picker}
      initialFresh={entry.fresh}
      resetWorkspace={(picker = false) =>
        setEntry((current) => ({
          version: current.version + 1,
          picker,
          fresh: true,
        }))
      }
    />
  );
}
function BankingPage({
  initialPicker,
  initialFresh,
  resetWorkspace,
}: {
  initialPicker: boolean;
  initialFresh: boolean;
  resetWorkspace: (picker?: boolean) => void;
}) {
  const workspace = useBankingWorkspace({
    initialPicker,
    initialFresh,
    resetWorkspace,
  });
  if (workspace.kind === "entry") return workspace.content;
  const context = workspace.context;
  const {
    data,
    navigate,
    route,
    retailItem,
    view,
    setView,
    busy,
    setSearch,
    serviceSearch,
    setServiceSearch,
    load,
    perform,
    role,
    staff,
    retail,
    customerNav,
  } = context;
  return (
    <div
      key={data.bank.id}
      className={`app-shell${retail ? " customer-retail has-retail-menu" : ""}${staff ? " branch-workspace" : ""}`}
    >
      <WorkspaceSidebar context={context} />
      <div className="main-shell">
        <WorkspaceHeader context={context} />
        {retail && (
          <nav className="retail-navigation" aria-label="Workspace shortcuts">
            {customerNav.map((item) => {
              const Icon = navIcons[item];
              if (item === "application")
                return (
                  <a
                    key={item}
                    className="retail-onboarding-link"
                    href="/open-account"
                  >
                    <Icon size={18} aria-hidden="true" />
                    {labels[item]}
                  </a>
                );
              return (
                <a
                  href={viewPaths[item]}
                  key={item}
                  className={view === item ? "active" : ""}
                  aria-current={view === item ? "page" : undefined}
                  onClick={(event) =>
                    followPortalLink(event, () => {
                      setView(item);
                      setSearch("");
                    })
                  }
                >
                  <Icon size={18} />
                  {item === "cards" ? "Debit cards" : labels[item]}
                </a>
              );
            })}
          </nav>
        )}
        <main className="content">
          <WorkspaceStatus context={context} />

          {view === "overview" && retail && (
            <RetailOverview data={data} navigate={setView} />
          )}
          {view === "overview" && staff && (
            <BranchOverview data={data} navigate={setView} />
          )}
          {view === "accounts" && (
            <RetailAccount data={data} navigate={setView} />
          )}
          {view === "planning" && role !== "approver" && (
            <Planning
              key={data.bank.id + data.role}
              embedded
              routeTab={route?.planningTab ?? "Overview"}
              navigate={navigate}
            />
          )}
          {view === "profile" && (
            <RetailProfile
              key={data.bank.id + data.role}
              data={data}
              openAccount={() => setView("application")}
              openServices={() => {
                setServiceSearch("Account changes");
                setView("services");
              }}
              openCase={(reference) => {
                setServiceSearch(`case:${reference}`);
                setView("services");
              }}
            />
          )}
          <OverviewScreen context={context} />

          {view === "application" && data.bank.applicant && !staff && (
            <CustomerOnboarding
              onOpened={() => {
                setView("accounts");
                perform(load(), "Your account is ready.", false);
              }}
            />
          )}
          {view === "accounts" && data.bank.applicant && !staff && (
            <a href="/open-account">View opening receipt</a>
          )}
          <ApplicationScreen context={context} />

          <TransferScreen context={context} />

          <CashScreen context={context} />

          <ApprovalsScreen context={context} />

          <StatementsScreen context={context} />

          {view === "loans" && (
            <Loans
              key={data.bank.id + data.role}
              bankId={data.bank.id}
              role={data.role}
              busy={busy}
              perform={perform}
              accountOpened={Boolean(data.account)}
              openAccount={() => setView("application")}
            />
          )}
          {view === "deposits" && (
            <Deposits
              key={
                data.bank.id +
                data.role +
                (retailItem?.destination.kind === "workspace"
                  ? (retailItem.destination.section ?? "")
                  : "")
              }
              navigate={navigate}
              initialProduct={
                retailItem?.destination.kind === "workspace" &&
                retailItem.destination.section === "recurring"
                  ? "recurring"
                  : "fixed"
              }
              bankId={data.bank.id}
              role={data.role}
              busy={busy}
              perform={perform}
              accountOpened={Boolean(data.account)}
              openAccount={() => setView("application")}
            />
          )}
          {view === "cards" && (
            <Cards
              key={data.bank.id + data.role}
              routeTab={route?.cardTab}
              navigate={navigate}
              bankId={data.bank.id}
              role={data.role}
              busy={busy}
              perform={perform}
              openAccount={() => setView("application")}
            />
          )}
          {view === "services" && (
            <ServiceCentre
              key={
                data.bank.id +
                data.role +
                serviceSearch +
                (route?.serviceSearch ?? "")
              }
              routeTab={
                route?.serviceTab ??
                (serviceSearch.startsWith("case:")
                  ? "requests"
                  : retail
                    ? "directory"
                    : "requests")
              }
              navigate={navigate}
              initialSearch={
                route?.serviceSearch ??
                (serviceSearch.startsWith("case:") ? "" : serviceSearch)
              }
              initialRequest={
                serviceSearch.startsWith("case:") ? serviceSearch.slice(5) : ""
              }
              data={data}
              busy={busy}
              perform={perform}
              openAccount={() => setView("application")}
            />
          )}

          <OperationsScreen context={context} />

          {view === "audit" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>The complete activity trail</h2>
                  <p>
                    Application actions and core posting references, in order.
                  </p>
                </div>
                <Clock3 size={21} />
              </div>
              <div className="audit-list">
                {data.audit.map((event) => (
                  <div className="audit-event" key={event.id}>
                    <span className="audit-dot" />
                    <div>
                      <div className="audit-title">
                        <strong>{event.action}</strong>
                        <span>{event.actor}</span>
                      </div>
                      <p>{event.detail}</p>
                      <small>{event.created_at} UTC</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} />
              Synthetic data. Demonstration money. Real banking workflows.
            </span>
            <span>
              OpenFinacle <span className="footer-dot">/</span> Powered by
              Apache Fineract
            </span>
          </footer>
        </main>
      </div>
      {busy && (
        <div className="working" role="status">
          <LoaderCircle size={17} className="spin" />
          Working with the bank…
        </div>
      )}
    </div>
  );
}
