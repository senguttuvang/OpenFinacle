"use client";

import { Effect } from "effect";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  FileCheck2,
  FileText,
  Fingerprint,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  type CommandKind,
  formatMoney,
  type Role,
} from "../src/domain/banking";
import type { Dashboard } from "../src/domain/view";
import { api, setApiCustomerScope } from "./api";
import { BranchOverview } from "./branch-overview";
import { CommandMenu } from "./command-menu";
import { CustomerOnboarding } from "./customer-onboarding";
import { CustomerPicker } from "./customer-picker";
import { CustomerTransfer } from "./customer-transfer";
import { endDemoSession } from "./demo-session";
import { FormSelect } from "./form-select";
import { viewLabels as labels, navigationFor, type View } from "./navigation";
import { PersonaSelect } from "./persona-select";
import { followPortalLink, usePortalLocation } from "./portal-location";
import {
  resolvePortalRoute,
  retailPath,
  routeAllowed,
  viewPaths,
} from "./portal-routes";
import { ProfileMenu } from "./profile-menu";
import "./demo-entry.css";
import { RetailNavigation, RetailUnavailable } from "./retail-navigation";
import { RetailAccount, RetailOverview } from "./retail-overview";
import { ServiceCentre } from "./service-centre";
import { initializeTelemetry } from "./telemetry";

const Cards = dynamic(
  () => import("./card-workspace").then((module) => module.CardWorkspace),
  {
    loading: () => <p role="status">Loading card workspace…</p>,
  },
);
const Deposits = dynamic(
  () => import("./deposit-workspace").then((module) => module.DepositWorkspace),
  {
    loading: () => <p role="status">Loading deposit workspace…</p>,
  },
);
const Loans = dynamic(
  () => import("./loan-workspace").then((module) => module.LoanWorkspace),
  { loading: () => <p role="status">Loading lending workspace…</p> },
);
const RetailProfile = dynamic(
  () => import("./customer-profile").then((module) => module.CustomerProfile),
  {
    loading: () => <p role="status">Loading profile workspace…</p>,
  },
);

const Planning = dynamic(
  () =>
    import("./planning/planning-workspace").then(
      (module) => module.PlanningWorkspace,
    ),
  { loading: () => <p role="status">Loading wealth and planning…</p> },
);

const roles: Record<Role, { name: string; person: string; initials: string }> =
  {
    customer: { name: "Customer", person: "Mira Krishnan", initials: "MK" },
    officer: {
      name: "Bank officer",
      person: "Priya · Branch operations",
      initials: "PR",
    },
    approver: {
      name: "Approver",
      person: "Dev · Branch manager",
      initials: "DV",
    },
  };
const navIcons = {
  overview: LayoutDashboard,
  accounts: Landmark,
  profile: Users,
  application: FileCheck2,
  transfer: ArrowLeftRight,
  statements: FileText,
  services: CreditCard,
  cards: CreditCard,
  deposits: Landmark,
  loans: Landmark,
  planning: TrendingUp,
  cash: Wallet,
  approvals: ShieldCheck,
  operations: Building2,
  audit: Clock3,
};
const statusLabel = (status: string) =>
  ({
    awaiting_approval: "Awaiting approval",
    needs_changes: "Needs information",
    submitted: "Under review",
    approved: "Account opened",
    pending: "Awaiting approval",
    posted: "Completed",
    rejected: "Declined",
    reversed: "Reversed",
    failed: "Not processed",
    uncertain: "Needs reconciliation",
    opening_exception: "Opening exception",
    opening: "Opening account",
  })[status] ?? status.replaceAll("_", " ");
const Pill = ({ status }: { status: string }) => (
  <span
    className={`pill ${["posted", "approved", "active", "fulfilled"].includes(status) ? "success" : ["failed", "uncertain", "opening_exception", "rejected"].includes(status) ? "danger" : "pending"}`}
  >
    <span />
    {statusLabel(status)}
  </span>
);

const PendingButton = ({
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean }) => (
  <button {...props} disabled={busy || props.disabled}>
    {busy ? <LoaderCircle size={16} className="spin" /> : null}
    {children}
  </button>
);

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
  const [chooseCustomer, setChooseCustomer] = useState(initialPicker);
  const [data, setData] = useState<Dashboard | null>(null);
  const { path, navigate } = usePortalLocation();
  const route = resolvePortalRoute(path);
  const retailItem = route?.item;
  const allowed =
    !data ||
    Boolean(route && routeAllowed(route, data.role, data.bank.journey));
  const view =
    !allowed || !route
      ? "forbidden"
      : route.family
        ? "family"
        : (route.view ?? "unavailable");
  const setView = useCallback(
    (destination: View) => navigate(viewPaths[destination]),
    [navigate],
  );
  useEffect(() => {
    document.title = `${route?.title ?? "Banking"} — OpenFinacle`;
  }, [route?.title]);
  const [busy, setBusy] = useState(false);
  const [startupStage, setStartupStage] = useState("");
  const [loading, setLoading] = useState(!initialPicker && !initialFresh);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "Mira Krishnan",
    email: "mira@example.test",
    phone: "9000000001",
    address: "14 Garden Lane, Adyar, Chennai 600020",
    employment: "Designer at Northstar Studio",
  });
  const [amount, setAmount] = useState("2500");
  const [note, setNote] = useState("For this month's shared expenses");
  const [cashKind, setCashKind] = useState<"deposit" | "withdrawal" | "salary">(
    "deposit",
  );
  const [cashAmount, setCashAmount] = useState("10000");
  const [reviewNote, setReviewNote] = useState(
    "Identity and address documents checked. Recommend account opening.",
  );
  const [beneficiaryName, setBeneficiaryName] = useState("Arjun Raman");
  const [otp, setOtp] = useState("246810");
  const [serviceSearch, setServiceSearch] = useState("");

  const load = useCallback(
    (refresh = false) =>
      api<Dashboard>(`/dashboard${refresh ? "?refresh=true" : ""}`).pipe(
        Effect.tap((next) =>
          Effect.sync(() => {
            setApiCustomerScope(next.bank.id);
            setData(next);
          }),
        ),
      ),
    [],
  );
  useEffect(() => {
    void Effect.runPromise(initializeTelemetry());
    if (initialPicker || initialFresh) return;
    void Effect.runPromise(
      load().pipe(
        Effect.catchAll((e) =>
          Effect.sync(() => {
            if (e.status !== 401) setError(e.message);
          }),
        ),
        Effect.ensuring(Effect.sync(() => setLoading(false))),
      ),
    );
  }, [load, initialPicker, initialFresh]);
  useEffect(() => {
    // A restored document must not expose a demo that was ended in the meantime.
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setData(null);
      setApiCustomerScope(null);
      setLoading(true);
      void Effect.runPromise(
        load().pipe(
          Effect.catchAll((failure) =>
            Effect.sync(() => {
              if (failure.status !== 401) setError(failure.message);
            }),
          ),
          Effect.ensuring(Effect.sync(() => setLoading(false))),
        ),
      );
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const perform = <A,>(
    task: Effect.Effect<A, { message: string }>,
    message: string,
    refresh = true,
  ) => {
    if (busy) return;
    setBusy(true);
    setError("");
    void Effect.runPromise(
      task.pipe(
        Effect.flatMap(() => (refresh ? Effect.asVoid(load()) : Effect.void)),
        Effect.tap(() => Effect.sync(() => setToast(message))),
        Effect.catchAll((e) => Effect.sync(() => setError(e.message))),
        Effect.ensuring(Effect.sync(() => setBusy(false))),
      ),
    );
  };
  const startJourney = (journey: "new" | "existing") =>
    perform(
      Effect.gen(function* () {
        yield* Effect.sync(() => setStartupStage("Opening your saved demo…"));
        const result = yield* api<{ dashboard: Dashboard }>("/session", {
          journey,
        });
        yield* Effect.sync(() => {
          setApiCustomerScope(result.dashboard.bank.id);
          setData(result.dashboard);
          if (path === "/demo") setView("overview");
        });
      }),
      "Your saved demo is ready.",
      false,
    );
  const selectCustomer = (customerId: string) =>
    perform(
      api<{ dashboard: Dashboard }>("/customer-selection", { customerId }).pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            setApiCustomerScope(result.dashboard.bank.id);
            setData(result.dashboard);
            setChooseCustomer(false);
            if (data || path === "/demo") setView("overview");
          }),
        ),
      ),
      "Your selected customer's saved account is ready.",
      false,
    );
  const changeRole = (role: Role, destination: View = "overview") => {
    setView(destination);
    perform(
      api("/session/role", { role }),
      `Switched to ${roles[role].name.toLowerCase()}.`,
    );
  };
  const instruction = (
    kind: CommandKind,
    value = 0,
    description = "",
    extra: Record<string, string> = {},
  ) =>
    perform(
      api(
        "/commands",
        {
          kind,
          ...(value > 0 ? { amount: value } : {}),
          description,
          ...extra,
        },
        crypto.randomUUID(),
      ),
      kind === "transfer" && value <= 25000
        ? "Transfer completed. Your statement is up to date."
        : "Instruction sent to the separate approver.",
    );
  const exitDemo = () =>
    perform(
      endDemoSession().pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            setData(null);
            setApiCustomerScope(null);
            window.location.assign("/");
          }),
        ),
      ),
      "Demo ended.",
      false,
    );
  const attach = (kind: "identity" | "address", file?: File) => {
    const body = new FormData();
    body.set("kind", kind);
    body.set(
      "file",
      file ??
        new File(
          [
            `SYNTHETIC DEMO DOCUMENT\n${form.name}\n${kind === "identity" ? "Demo identity reference: DEMO-MIRA-001" : form.address}\nNot valid for identification. No real personal information.`,
          ],
          `sample-${kind}.txt`,
          { type: "text/plain" },
        ),
    );
    return api("/documents", body);
  };
  const sampleDocs = () =>
    perform(
      Effect.all([attach("identity"), attach("address")], { concurrency: 1 }),
      "Two synthetic documents attached.",
    );

  useEffect(() => {
    // Public story links arrive while the session check still renders loading.
    // Restore the requested entry anchor after the journey controls mount.
    if (!loading && !data && window.location.hash === "#demo-entry") {
      document.getElementById("demo-entry")?.scrollIntoView();
    }
  }, [loading, data]);

  if (loading)
    return (
      <main className="loading">
        <Landmark size={35} />
        <p>Connecting your banking workspace…</p>
        <LoaderCircle className="spin" />
      </main>
    );
  if (!data)
    return (
      <main className="demo-entry-page">
        <a className="brand" href="/">
          <Landmark size={26} aria-hidden="true" /> OpenFinacle.
        </a>
        <section className="demo-entry-panel" aria-label="Banking demo entry">
          <h1>Choose your banking journey</h1>
          <p>
            Explore with sample customers and demonstration money. Saved banking
            records remain available between visits.
          </p>
          {path !== "/demo" && (
            <p role="status">
              Open your saved banking demo to continue to{" "}
              {route?.title ?? "this screen"}. The link does not change your
              selected customer or role.
            </p>
          )}
          {chooseCustomer ? (
            <CustomerPicker
              busy={busy}
              onSelect={selectCustomer}
              onCancel={() => setChooseCustomer(false)}
            />
          ) : (
            <div className="journey-options evidence-journeys">
              <div>
                <PendingButton
                  busy={busy}
                  className="primary large"
                  onClick={() => window.location.assign("/open-account")}
                >
                  Open my first account <ArrowRight size={18} />
                </PendingButton>
                <p>
                  New customer · staged synthetic application and staff review.
                </p>
              </div>
              <div>
                <PendingButton
                  busy={busy}
                  className="secondary large"
                  onClick={() => setChooseCustomer(true)}
                >
                  Explore existing customer <ArrowRight size={18} />
                </PendingButton>
                <p>
                  Saved customers · account facts, payments, statements and
                  planning.
                </p>
              </div>
              <div>
                <PendingButton
                  busy={busy}
                  className="secondary large"
                  onClick={() => startJourney("new")}
                >
                  Start your banking story · Shared branch demo{" "}
                  <ArrowRight size={18} />
                </PendingButton>
                <p>
                  Original shared account-opening demonstration · customer and
                  staff views.
                </p>
              </div>
            </div>
          )}
          {busy && <p role="status">{startupStage}</p>}
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          <a className="demo-website-link" href="/">
            Back to the product website{" "}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </section>
      </main>
    );

  const role = data.role;
  const staff = role !== "customer";
  const retail = !staff && data.bank.journey === "existing";
  const account = data.account;
  const balance = account?.summary?.accountBalance ?? 0;
  const pending = data.commands.filter((c) => c.status === "pending");
  const activeBeneficiary = data.beneficiaries.find(
    (b) => b.status === "active",
  );
  const transactions = [...(account?.transactions ?? [])].sort(
    (a, b) => b.id - a.id,
  );
  const navigation = navigationFor(role, data.bank.journey);
  const viewTitle =
    navigation.find((item) => item.view === view)?.label ??
    (view === "unavailable"
      ? (retailItem?.label ?? "Service unavailable")
      : view === "forbidden"
        ? "Screen unavailable for this session"
        : view === "family"
          ? route?.title
          : labels[view]);
  const customerNav: View[] = [
    "statements",
    "cards",
    "planning",
    "application",
  ];
  const journeySteps = [
    Boolean(data.application),
    data.application?.status === "approved",
    data.commands.some((c) => c.kind === "deposit" && c.status === "posted"),
    Boolean(activeBeneficiary),
    data.commands.some((c) => c.kind === "transfer" && c.status === "posted"),
    data.commands.some((c) => c.kind === "salary" && c.status === "posted"),
  ];
  const progress = journeySteps.filter(Boolean).length;
  const onboardingNextStep = !data.application
    ? {
        title: "Let's open your account",
        text: "Start with your details and two sample documents.",
        action: () => {
          setView("application");
          if (role !== "customer") changeRole("customer", "application");
        },
        button: "Begin application",
      }
    : data.application.status === "submitted"
      ? {
          title: "Your documents are with the bank",
          text: "Step behind the counter and review the application as a bank officer.",
          action: () => changeRole("officer", "application"),
          button: "Review as bank officer",
        }
      : data.application.status === "awaiting_approval"
        ? {
            title: "A second pair of eyes",
            text: "A separate approver authorises the account opening.",
            action: () => changeRole("approver", "application"),
            button: "Switch to approver",
          }
        : data.application.status === "needs_changes"
          ? {
              title: "A little more information",
              text: "Read the officer's note and update your application.",
              action: () => changeRole("customer", "application"),
              button: "Update application",
            }
          : ["opening", "opening_exception"].includes(data.application.status)
            ? {
                title: "Account opening needs attention",
                text: "The bank must inspect the core outcome before trying the opening again.",
                action: () => changeRole("officer", "application"),
                button: "Inspect opening status",
              }
            : pending.length > 0
              ? {
                  title: "Ready for a second pair of eyes",
                  text: "Your instruction is waiting for independent approval before it can affect the account.",
                  action: () => changeRole("approver", "approvals"),
                  button: "Review pending instruction",
                }
              : !journeySteps[2]
                ? {
                    title: "Make your first deposit",
                    text: "Visit the cash desk as the officer. The approver will authorise the posting.",
                    action: () => changeRole("officer", "cash"),
                    button: "Go to the cash desk",
                  }
                : !journeySteps[3]
                  ? {
                      title: "Add someone you know",
                      text: "Add Arjun as a beneficiary and confirm the demo verification code.",
                      action: () => changeRole("customer", "transfer"),
                      button: "Add beneficiary",
                    }
                  : !journeySteps[4]
                    ? {
                        title: "Send your first payment",
                        text: "Transfer money to Arjun. Both accounts will update in the banking core.",
                        action: () => changeRole("customer", "transfer"),
                        button: "Make a transfer",
                      }
                    : !journeySteps[5]
                      ? {
                          title: "It's salary day",
                          text: "The officer prepares a salary payment from Northstar Studio's funded account.",
                          action: () => {
                            setCashKind("salary");
                            setCashAmount("85000");
                            changeRole("officer", "cash");
                          },
                          button: "Prepare salary payment",
                        }
                      : {
                          title: "Your banking story is connected",
                          text: "Explore statements, account controls and the full activity trail.",
                          action: () => {
                            setView("statements");
                            if (staff) changeRole("customer", "statements");
                          },
                          button: "View your statement",
                        };

  const nextStep =
    data.bank.journey === "existing" && account
      ? {
          title: "An established customer relationship",
          text: "Review balances, account restrictions, cash instructions and service requests from the branch workspace.",
          action: () => setView("operations"),
          button: "Review customer operations",
        }
      : onboardingNextStep;

  return (
    <div
      key={data.bank.id}
      className={`app-shell${retail ? " customer-retail has-retail-menu" : ""}${staff ? " branch-workspace" : ""}`}
    >
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
              view === "unavailable" ||
              view === "family" ||
              view === "forbidden"
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
              <p>
                OpenFinacle is a demo. Use only the sample customer details.
              </p>
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
                endDemoSession().pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      setData(null);
                      navigate("/demo");
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
      <div className="main-shell">
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
                perform(
                  load(true),
                  "Balances synchronized with Fineract.",
                  false,
                )
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
                  endDemoSession().pipe(
                    Effect.tap(() =>
                      Effect.sync(() => {
                        setApiCustomerScope(null);
                        navigate("/demo");
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
            <ProfileMenu
              disabled={busy}
              initials={
                staff
                  ? roles[role].initials
                  : (account?.clientName ?? "Customer")
                      .split(/\s+/)
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")
              }
              name={
                staff
                  ? role === "officer"
                    ? "Priya Rao"
                    : "Dev Sharma"
                  : (account?.clientName ??
                    data.application?.name ??
                    "Demonstration customer")
              }
              persona={roles[role].name}
              profileLabel={staff ? "Customer profile" : "My profile"}
              onProfile={() => setView("profile")}
              onExit={exitDemo}
            />
          </div>
        </header>
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
              <p>
                Choose a service. Each link opens its own saved destination.
              </p>
              <ul>
                {route.family.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={retailPath(item)}
                      onClick={(event) =>
                        followPortalLink(event, () =>
                          navigate(retailPath(item)),
                        )
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
          <div
            className="page-heading"
            hidden={
              view === "unavailable" ||
              view === "family" ||
              view === "forbidden"
            }
          >
            <div>
              <span className="eyebrow">
                {staff
                  ? "ADYAR BRANCH · CHENNAI"
                  : retail
                    ? "PERSONAL BANKING / MY VIEW"
                    : "YOUR EVERYDAY, SIMPLIFIED"}
              </span>
              <h1>
                {view === "overview"
                  ? staff
                    ? "Branch overview"
                    : retail
                      ? `Welcome back, ${(account?.clientName ?? "Mira").split(" ")[0]}`
                      : `Good things ahead, ${(data.application?.name ?? "Mira").split(" ")[0]}.`
                  : viewTitle}
              </h1>
              <p>
                {view === "overview"
                  ? staff
                    ? "Your work queues, customer context and operational controls."
                    : retail
                      ? "Here's an overview of your relationship with us."
                      : "Your money, your next step, and everything in between."
                  : view === "application"
                    ? "A simple beginning. Carefully reviewed."
                    : view === "planning"
                      ? "Explore synthetic household spending, wealth and future decisions. Planning is separate from your bank balances."
                      : view === "transfer"
                        ? "Send money confidently to the people who matter."
                        : view === "cash"
                          ? "Record the instruction here. A separate approver posts it."
                          : view === "approvals"
                            ? "Review the details. Keep the maker and approver separate."
                            : "Your banking activity, clearly connected."}
              </p>
            </div>
            <span className="business-date">
              <Clock3 size={14} />
              {data.businessDate}
            </span>
          </div>
          <p
            className="sync-caption"
            hidden={
              view === "unavailable" ||
              view === "family" ||
              view === "forbidden"
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
          {view === "overview" && !retail && !staff && (
            <>
              <div className="overview-grid">
                <section className="balance-card">
                  <div className="card-top">
                    <span>
                      <Wallet size={18} /> EVERYDAY SAVINGS
                    </span>
                    <span className="card-bank">of.</span>
                  </div>
                  <div className="balance-label">
                    {account
                      ? "Your account balance"
                      : "Your account starts here"}
                  </div>
                  <div className="balance-amount" data-testid="balance">
                    {formatMoney(balance)}
                  </div>
                  <div className="account-number">
                    {account
                      ? `A/C ${account.accountNo}  ·  ${account.status.value}`
                      : "Open an account to begin your banking story"}
                  </div>
                  <div className="balance-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setView(account ? "transfer" : "application")
                      }
                    >
                      {account ? <Send size={16} /> : <Plus size={16} />}
                      {account ? "Send money" : "Open account"}
                      <ArrowUpRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("statements")}
                      disabled={!account}
                    >
                      <FileText size={16} /> Statement
                    </button>
                  </div>
                  <div className="balance-pattern" aria-hidden="true" />
                </section>
                <section className="next-step">
                  <span className="eyebrow">
                    <span className="step-spark">
                      <Sparkles size={15} />
                    </span>{" "}
                    YOUR NEXT STEP
                  </span>
                  <h2>{nextStep.title}</h2>
                  <p>{nextStep.text}</p>
                  <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    onClick={nextStep.action}
                  >
                    {nextStep.button}
                    <ArrowRight size={16} />
                  </button>
                  <div className="journey-progress">
                    <div>
                      <span style={{ width: `${(progress / 6) * 100}%` }} />
                    </div>
                    <small>{progress} of 6 milestones complete</small>
                  </div>
                </section>
              </div>
              <div className="quick-row">
                {[
                  {
                    icon: ArrowLeftRight,
                    title: "Pay someone",
                    subtitle: "Beneficiaries & transfers",
                    destination: "transfer" as View,
                  },
                  {
                    icon: ArrowDownToLine,
                    title: "Your statements",
                    subtitle: "Every transaction, clearly",
                    destination: "statements" as View,
                  },
                  {
                    icon: CreditCard,
                    title: "At your service",
                    subtitle: "Cards, cheques & requests",
                    destination: "services" as View,
                  },
                ].map(({ icon: Icon, title, subtitle, destination }) => (
                  <button
                    type="button"
                    className="quick-item"
                    key={title}
                    onClick={() =>
                      setView(
                        staff && destination === "transfer"
                          ? "cash"
                          : destination,
                      )
                    }
                  >
                    <span className="quick-icon">
                      <Icon size={20} />
                    </span>
                    <span>
                      <strong>{title}</strong>
                      <small>{subtitle}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              <div className="lower-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>A little context for every movement.</p>
                    </div>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => setView(staff ? "audit" : "statements")}
                    >
                      View all <ArrowRight size={14} />
                    </button>
                  </div>
                  {data.commands.length ? (
                    <div className="activity-list">
                      {data.commands.slice(0, 5).map((c) => (
                        <div className="activity" key={c.id}>
                          <span
                            className={`activity-icon ${["deposit", "salary"].includes(c.kind) ? "incoming" : ""}`}
                          >
                            {["deposit", "salary"].includes(c.kind) ? (
                              <ArrowDownLeft size={19} />
                            ) : (
                              <ArrowUpRight size={19} />
                            )}
                          </span>
                          <div>
                            <strong>{c.description}</strong>
                            <small>
                              {c.kind.replaceAll("_", " ")} ·{" "}
                              {new Date(
                                `${c.created_at.replace(" ", "T")}Z`,
                              ).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                              })}
                            </small>
                          </div>
                          <div className="activity-value">
                            <strong>
                              {c.amount_minor
                                ? formatMoney(c.amount_minor / 100)
                                : "Account control"}
                            </strong>
                            <Pill status={c.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <ArrowLeftRight size={26} />
                      <h3>
                        {data.bank.journey === "existing"
                          ? "Your account activity is ready"
                          : "Your story is just beginning"}
                      </h3>
                      <p>
                        {data.bank.journey === "existing"
                          ? "Inspect My accounts and the audit trail for the sample account setup. New instructions will appear here."
                          : "Deposits, payments and salary credits will appear here."}
                      </p>
                    </div>
                  )}
                </section>
                {data.bank.journey === "existing" && (
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Customer relationship</h2>
                        <p>Active savings · {account?.clientName}</p>
                      </div>
                    </div>
                    <div className="detail-grid">
                      <div>
                        <small>Customer account</small>
                        <strong>{account?.accountNo}</strong>
                      </div>
                      <div>
                        <small>Account status</small>
                        <strong>{account?.status.value}</strong>
                      </div>
                      <div>
                        <small>
                          {data.customer && !staff
                            ? "Saved payees"
                            : "Saved beneficiaries"}
                        </small>
                        <strong>
                          {data.customer && !staff
                            ? (data.payeeSummary?.count ?? 0)
                            : data.beneficiaries.length}
                        </strong>
                      </div>
                      <div>
                        <small>Open service requests</small>
                        <strong>
                          {
                            data.requests.filter(
                              (request) => request.status === "open",
                            ).length
                          }
                        </strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setView("accounts")}
                    >
                      Inspect account details <ArrowRight size={15} />
                    </button>
                  </section>
                )}
                <section
                  className="panel journey-panel"
                  style={
                    data.bank.journey === "existing"
                      ? { display: "none" }
                      : undefined
                  }
                >
                  <div className="panel-heading">
                    <div>
                      <h2>From first hello to payday</h2>
                      <p>Your six-step banking journey.</p>
                    </div>
                  </div>
                  {[
                    "Submit your application",
                    "Get your account opened",
                    "Make an initial deposit",
                    "Add a beneficiary",
                    "Send your first transfer",
                    "Receive your salary",
                  ].map((step, i) => (
                    <div
                      className={`journey-step ${journeySteps[i] ? "complete" : ""}`}
                      key={step}
                    >
                      <span>
                        {journeySteps[i] ? <Check size={13} /> : i + 1}
                      </span>
                      <strong>{step}</strong>
                      {journeySteps[i] && <small>Done</small>}
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}

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
          {view === "application" && (!data.bank.applicant || staff) && (
            <div className="form-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      {staff ? "Customer application" : "Your first account"}
                    </h2>
                    <p>
                      {staff
                        ? "Review submitted details and supporting documents."
                        : "Everyday Savings · 3.5% p.a. configured interest · INR"}
                    </p>
                  </div>
                  {data.application && (
                    <Pill status={data.application.status} />
                  )}
                </div>
                {staff ? (
                  data.application ? (
                    <>
                      <div className="detail-grid">
                        {Object.entries({
                          Customer: data.application.name,
                          Email: data.application.email,
                          Phone: data.application.phone,
                          Address: data.application.address,
                          Employment: data.application.employment,
                        }).map(([key, value]) => (
                          <div key={key}>
                            <small>{key}</small>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="document-list">
                        {data.documents.map((doc) => (
                          <a
                            key={doc.id}
                            href={`/api/documents/${doc.id}`}
                            className="document"
                          >
                            <FileCheck2 size={20} />
                            <div>
                              <strong>{doc.name}</strong>
                              <small>{doc.kind} · synthetic document</small>
                            </div>
                            <ArrowDownToLine size={17} />
                          </a>
                        ))}
                      </div>
                      {data.application.review_note && (
                        <div className="notice neutral">
                          {data.application.review_note}
                        </div>
                      )}
                      {role === "officer" &&
                        data.application.status === "submitted" && (
                          <div className="form-actions-column">
                            <label>
                              Review notes
                              <textarea
                                value={reviewNote}
                                onChange={(e) => setReviewNote(e.target.value)}
                              />
                            </label>
                            <div className="button-row">
                              <PendingButton
                                busy={busy}
                                className="primary"
                                onClick={() =>
                                  perform(
                                    api("/application/review", {
                                      decision: "recommend",
                                      note: reviewNote,
                                    }),
                                    "Application sent to the separate approver.",
                                  )
                                }
                              >
                                Recommend opening <ArrowRight size={16} />
                              </PendingButton>
                              <PendingButton
                                busy={busy}
                                className="secondary"
                                onClick={() =>
                                  perform(
                                    api("/application/review", {
                                      decision: "needs_changes",
                                      note: reviewNote,
                                    }),
                                    "Customer notified of requested information.",
                                  )
                                }
                              >
                                Request information
                              </PendingButton>
                            </div>
                          </div>
                        )}
                      {role === "approver" &&
                        data.application.status === "awaiting_approval" && (
                          <PendingButton
                            busy={busy}
                            className="primary"
                            onClick={() =>
                              perform(
                                api("/application/review", {
                                  decision: "approve",
                                  note: "Approved after independent review",
                                }),
                                "Account opened and activated in the banking core.",
                              )
                            }
                          >
                            Approve & open account <CheckCheck size={16} />
                          </PendingButton>
                        )}
                      {data.application.status === "awaiting_approval" &&
                        role === "officer" && (
                          <button
                            type="button"
                            className="primary"
                            onClick={() =>
                              changeRole("approver", "application")
                            }
                          >
                            Continue as the approver <ArrowRight size={16} />
                          </button>
                        )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <FileText />
                      <h3>No application yet</h3>
                      <p>Switch to the customer to start the journey.</p>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => changeRole("customer", "application")}
                      >
                        Start as customer
                      </button>
                    </div>
                  )
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      perform(
                        api("/application", form),
                        "Application submitted. The bank officer can now review it.",
                      );
                    }}
                  >
                    <div className="fields-grid">
                      {(["name", "email", "phone", "employment"] as const).map(
                        (key) => (
                          <label key={key}>
                            {
                              {
                                name: "Full name",
                                email: "Email address",
                                phone: "Mobile number",
                                employment: "Employment",
                              }[key]
                            }
                            <input
                              required
                              value={form[key]}
                              onChange={(e) =>
                                setForm({ ...form, [key]: e.target.value })
                              }
                              disabled={data.application?.status === "approved"}
                              type={key === "email" ? "email" : "text"}
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <label>
                      Residential address
                      <textarea
                        required
                        value={form.address}
                        onChange={(e) =>
                          setForm({ ...form, address: e.target.value })
                        }
                        disabled={data.application?.status === "approved"}
                      />
                    </label>
                    <h3 className="subheading">Supporting documents</h3>
                    <p className="muted">
                      Use the sample documents, or attach synthetic files.
                      Please don't upload real identity documents.
                    </p>
                    <div className="upload-grid">
                      {(["identity", "address"] as const).map((kind) => (
                        <label className="upload-box" key={kind}>
                          <FileCheck2 size={23} />
                          <strong>
                            {kind === "identity"
                              ? "Identity document"
                              : "Address proof"}
                          </strong>
                          <span>
                            {data.documents.some((d) => d.kind === kind)
                              ? "Document attached ✓"
                              : "PDF, JPG, PNG or TXT · Up to 1 MB"}
                          </span>
                          <input
                            aria-label={`Upload ${kind} document`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.txt"
                            disabled={busy}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file)
                                perform(
                                  attach(kind, file),
                                  "Document attached.",
                                );
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="button-row">
                      <PendingButton
                        busy={busy}
                        type="button"
                        className="secondary"
                        onClick={sampleDocs}
                        disabled={data.documents.length >= 2}
                      >
                        Use sample documents <Sparkles size={15} />
                      </PendingButton>
                      <PendingButton
                        busy={busy}
                        className="primary"
                        type="submit"
                        disabled={
                          !!(
                            data.application &&
                            !["needs_changes"].includes(data.application.status)
                          )
                        }
                      >
                        Submit application <ArrowRight size={16} />
                      </PendingButton>
                    </div>
                    {data.application?.review_note && (
                      <div className="notice neutral">
                        {data.application.review_note}
                      </div>
                    )}
                    {data.application?.status === "submitted" && (
                      <button
                        className="text-link spaced"
                        type="button"
                        onClick={() => changeRole("officer", "application")}
                      >
                        Next: review as bank officer <ArrowRight size={16} />
                      </button>
                    )}
                    {data.application?.status === "approved" && (
                      <div className="notice positive">
                        <CheckCircle2 size={18} />
                        Your account is open. You're ready for your first
                        deposit.
                      </div>
                    )}
                  </form>
                )}
              </section>
              <aside className="info-panel">
                <Fingerprint size={35} />
                <h2>
                  A thoughtful
                  <br />
                  first step.
                </h2>
                <p>
                  Opening an account connects your identity, documents, product
                  and branch.
                </p>
                <div className="info-line">
                  <CheckCircle2 size={17} />
                  Document review by the officer
                </div>
                <div className="info-line">
                  <CheckCircle2 size={17} />
                  Independent approval
                </div>
                <div className="info-line">
                  <CheckCircle2 size={17} />A real account in the banking core
                </div>
                <div className="small-note">
                  Identity verification is simulated. Account creation and
                  activation execute in Apache Fineract.
                </div>
              </aside>
            </div>
          )}

          {view === "transfer" && (
            <>
              {data.customer && !staff && (
                <CustomerTransfer
                  key={data.bank.id}
                  bankId={data.bank.id}
                  onPayeesChanged={() =>
                    perform(load(false), "Saved payees updated.", false)
                  }
                  onPosted={() =>
                    perform(
                      load(true),
                      "Balances and statement refreshed.",
                      false,
                    )
                  }
                />
              )}
              {(!data.customer || staff) && (
                <details
                  open={!data.customer || staff}
                  className="customer-legacy-transfer"
                >
                  <summary>
                    Saved demo beneficiaries and payment controls
                  </summary>
                  <div className="form-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Make a payment</h2>
                          <p>To another customer in your demo bank.</p>
                        </div>
                        <span className="circle-icon">
                          <Send size={20} />
                        </span>
                      </div>
                      {!account ? (
                        <div className="empty-state">
                          <LockKeyhole />
                          <h3>Your account comes first</h3>
                          <p>Complete account opening before sending money.</p>
                          <button
                            className="primary"
                            type="button"
                            onClick={() => setView("application")}
                          >
                            Open your account
                          </button>
                        </div>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            instruction("transfer", Number(amount), note, {
                              beneficiaryId: activeBeneficiary?.id ?? "",
                            });
                          }}
                        >
                          <label>
                            From account
                            <input
                              className="sr-only"
                              aria-label="From account number"
                              value={account.accountNo}
                              readOnly
                              tabIndex={-1}
                            />
                            <div className="account-selector">
                              <Landmark size={20} />
                              <div>
                                <strong>
                                  Everyday Savings · {account.accountNo}
                                </strong>
                                <small>{formatMoney(balance)} available</small>
                              </div>
                              <CheckCircle2 size={18} />
                            </div>
                          </label>
                          <label htmlFor="legacy-beneficiary">
                            To beneficiary
                            <FormSelect
                              id="legacy-beneficiary"
                              disabled={!activeBeneficiary}
                              aria-label="Select beneficiary"
                              value="confirmed-beneficiary"
                              onValueChange={() => undefined}
                              options={[
                                {
                                  value: "confirmed-beneficiary",
                                  label: activeBeneficiary
                                    ? `${activeBeneficiary.name} · ${activeBeneficiary.account_no}`
                                    : "Add and confirm a beneficiary first",
                                },
                              ]}
                            />
                          </label>
                          <div className="fields-grid">
                            <label>
                              Amount (INR)
                              <div className="money-input">
                                <span>₹</span>
                                <input
                                  type="number"
                                  min="0.01"
                                  max="10000000"
                                  step="0.01"
                                  required
                                  value={amount}
                                  onChange={(e) => setAmount(e.target.value)}
                                />
                              </div>
                            </label>
                            <label>
                              Payment note
                              <input
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={160}
                              />
                            </label>
                          </div>
                          <div className="notice neutral">
                            <ShieldCheck size={17} />
                            Transfers up to ₹25,000 post immediately. Larger
                            transfers go to the approver.
                          </div>
                          <PendingButton
                            busy={busy}
                            className="primary"
                            type="submit"
                            disabled={!activeBeneficiary}
                          >
                            Review & send money <ArrowRight size={16} />
                          </PendingButton>
                        </form>
                      )}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Your beneficiaries</h2>
                          <p>Know where your money is going.</p>
                        </div>
                        <Users size={20} />
                      </div>
                      {data.beneficiaries.map((b) => (
                        <div key={b.id} className="beneficiary">
                          <span className="avatar peach">AR</span>
                          <div>
                            <strong>{b.name}</strong>
                            <small>{b.account_no}</small>
                            <Pill status={b.status} />
                          </div>
                          {b.status === "pending" && (
                            <div className="otp-form">
                              <label>
                                Demo code
                                <input
                                  aria-label="Beneficiary verification code"
                                  value={otp}
                                  onChange={(e) => setOtp(e.target.value)}
                                />
                              </label>
                              <PendingButton
                                busy={busy}
                                className="primary"
                                onClick={() =>
                                  perform(
                                    api("/beneficiaries/confirm", {
                                      id: b.id,
                                      code: otp,
                                    }),
                                    "Beneficiary verified and active.",
                                  )
                                }
                              >
                                Confirm
                              </PendingButton>
                            </div>
                          )}
                        </div>
                      ))}
                      {!data.beneficiaries.length && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            perform(
                              api("/beneficiaries", { name: beneficiaryName }),
                              "Beneficiary added. Confirm with the demo code.",
                            );
                          }}
                        >
                          <div className="recipient-preview">
                            <span className="avatar peach">AR</span>
                            <div>
                              <strong>Arjun Raman</strong>
                              <small>A customer in your demo bank</small>
                            </div>
                          </div>
                          <label>
                            Beneficiary nickname
                            <input
                              value={beneficiaryName}
                              onChange={(e) =>
                                setBeneficiaryName(e.target.value)
                              }
                              required
                            />
                          </label>
                          <label>
                            Account number
                            <input value={data.recipient.accountNo} readOnly />
                          </label>
                          <PendingButton
                            busy={busy}
                            type="submit"
                            className="secondary"
                            disabled={!account}
                          >
                            <Plus size={16} />
                            Add beneficiary
                          </PendingButton>
                        </form>
                      )}
                      <div className="small-note">
                        <ShieldCheck size={16} />
                        Verification is simulated. Use <strong>246810</strong>;
                        no SMS is sent.
                      </div>
                    </section>
                  </div>
                </details>
              )}
            </>
          )}

          {view === "cash" && (
            <div className="form-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Prepare a banking instruction</h2>
                    <p>
                      Customer:{" "}
                      {account?.clientName ??
                        data.application?.name ??
                        "Account not yet opened"}
                    </p>
                  </div>
                  <Wallet size={21} />
                </div>
                <div className="segmented">
                  {(["deposit", "withdrawal", "salary"] as const).map(
                    (kind) => (
                      <button
                        className={cashKind === kind ? "selected" : ""}
                        type="button"
                        key={kind}
                        onClick={() => {
                          setCashKind(kind);
                          setCashAmount(kind === "salary" ? "85000" : "10000");
                        }}
                      >
                        {kind === "salary"
                          ? "Salary credit"
                          : kind === "deposit"
                            ? "Cash deposit"
                            : "Withdrawal"}
                      </button>
                    ),
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    instruction(
                      cashKind,
                      Number(cashAmount),
                      cashKind === "salary"
                        ? "Salary · Northstar Studio"
                        : cashKind === "deposit"
                          ? "Cash deposit · Adyar branch"
                          : "Cash withdrawal · Adyar branch",
                    );
                  }}
                >
                  <label>
                    Customer account
                    <input
                      readOnly
                      value={account?.accountNo ?? "Account opening required"}
                    />
                  </label>
                  <label>
                    Amount (INR)
                    <div className="money-input">
                      <span>₹</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                      />
                    </div>
                  </label>
                  {cashKind === "salary" && (
                    <div className="notice neutral">
                      <Building2 size={20} />
                      <div>
                        From Northstar Studio
                        <small>
                          Employer balance:{" "}
                          {formatMoney(
                            data.employer?.summary?.accountBalance ?? 0,
                          )}
                          . This is an account-to-account transfer, not a
                          balance adjustment.
                        </small>
                      </div>
                    </div>
                  )}
                  <PendingButton
                    busy={busy}
                    className="primary"
                    disabled={!account || role !== "officer"}
                    type="submit"
                  >
                    Send for approval <ArrowRight size={16} />
                  </PendingButton>
                </form>
              </section>
              <section className="info-panel">
                <ShieldCheck size={35} />
                <h2>
                  One instruction.
                  <br />
                  Two people.
                </h2>
                <p>
                  The officer prepares the instruction. The approver checks it.
                  Only then does the core post it.
                </p>
                <div className="info-line">
                  <CheckCircle2 size={17} />
                  No editable account balances
                </div>
                <div className="info-line">
                  <CheckCircle2 size={17} />
                  No duplicate posting on approval
                </div>
                <div className="info-line">
                  <CheckCircle2 size={17} />
                  Traceable core reference
                </div>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => changeRole("approver", "approvals")}
                >
                  Open approver's inbox <ArrowRight size={16} />
                </button>
              </section>
            </div>
          )}

          {view === "approvals" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    Ready for a second look{" "}
                    <span className="count">{pending.length}</span>
                  </h2>
                  <p>
                    {role === "approver"
                      ? "Your decisions execute against the banking core."
                      : "Only the separate approver can authorise these instructions."}
                  </p>
                </div>
                {role !== "approver" && (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => changeRole("approver", "approvals")}
                  >
                    Switch to approver
                  </button>
                )}
              </div>
              {pending.length ? (
                pending.map((c) => (
                  <article className="approval-card" key={c.id}>
                    <div>
                      <span className="eyebrow">
                        {c.kind.toUpperCase()} · BY {c.maker.toUpperCase()}
                      </span>
                      <h3>{c.description}</h3>
                      <p>
                        {data.application?.name} · A/C {account?.accountNo}
                      </p>
                      <small className="reference">
                        Instruction {c.id.slice(0, 8)}
                      </small>
                    </div>
                    <div className="approval-right">
                      <strong>
                        {c.amount_minor
                          ? formatMoney(c.amount_minor / 100)
                          : c.kind.replaceAll("_", " ")}
                      </strong>
                      <div className="button-row">
                        <PendingButton
                          busy={busy}
                          className="secondary"
                          disabled={role !== "approver"}
                          onClick={() =>
                            perform(
                              api("/commands/reject", { id: c.id }),
                              "Instruction declined.",
                            )
                          }
                        >
                          Decline
                        </PendingButton>
                        <PendingButton
                          busy={busy}
                          className="primary"
                          disabled={role !== "approver"}
                          onClick={() =>
                            perform(
                              api("/commands/approve", { id: c.id }),
                              "Instruction posted. Account balances are updated.",
                            )
                          }
                        >
                          Approve <Check size={15} />
                        </PendingButton>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <CheckCheck size={32} />
                  <h3>All caught up</h3>
                  <p>
                    New instructions appear here when they need independent
                    approval.
                  </p>
                </div>
              )}
            </section>
          )}

          {view === "statements" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Everyday Savings statement</h2>
                  <p>
                    {account
                      ? `Account ${account.accountNo} · Transactions from Apache Fineract`
                      : "Your statement will be available after opening an account."}
                  </p>
                </div>
                {account && (
                  <a className="secondary button" href="/api/statement">
                    <ArrowDownToLine size={16} />
                    Download CSV
                  </a>
                )}
              </div>
              <div className="table-toolbar">
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search transactions"
                    placeholder="Search transactions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <span>{transactions.length} transactions</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Amount</th>
                      <th>Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .filter((t) =>
                        `${t.transactionType.value} ${t.id}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className="table-transaction">
                              {t.transactionType.deposit ? (
                                <ArrowDownLeft size={16} />
                              ) : (
                                <ArrowUpRight size={16} />
                              )}
                              {t.transactionType.value}
                            </span>
                          </td>
                          <td>
                            {t.date[2]}/{t.date[1]}/{t.date[0]}
                          </td>
                          <td className="reference">#{t.id}</td>
                          <td
                            className={
                              t.transactionType.deposit ? "amount-credit" : ""
                            }
                          >
                            {t.transactionType.deposit ? "+" : "−"}
                            {formatMoney(t.amount)}
                          </td>
                          <td>{formatMoney(t.runningBalance ?? 0)}</td>
                          <td>
                            <Pill status={t.reversed ? "reversed" : "posted"} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!transactions.length && (
                  <div className="empty-state">
                    <FileText />
                    <h3>A fresh page</h3>
                    <p>Your first posted transaction will appear here.</p>
                  </div>
                )}
              </div>
            </section>
          )}

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

          {view === "operations" && (
            <>
              <div className="stats-row">
                <div>
                  <span>Customer savings</span>
                  <strong>{formatMoney(balance)}</strong>
                  <small>A/C {account?.accountNo ?? "Pending opening"}</small>
                </div>
                <div>
                  <span>Beneficiary savings</span>
                  <strong>
                    {formatMoney(data.recipient.summary?.accountBalance ?? 0)}
                  </strong>
                  <small>{data.recipient.clientName}</small>
                </div>
                <div>
                  <span>Employer funding</span>
                  <strong>
                    {formatMoney(data.employer?.summary?.accountBalance ?? 0)}
                  </strong>
                  <small>Northstar Studio</small>
                </div>
              </div>
              <div className="form-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Account controls</h2>
                      <p>Debit restrictions require separate approval.</p>
                    </div>
                    <LockKeyhole size={21} />
                  </div>
                  <div className="notice neutral">
                    Current core status: {account?.status.value ?? "No account"}
                    {account?.subStatus?.value
                      ? ` · ${account.subStatus.value}`
                      : ""}
                  </div>
                  <div className="button-row">
                    <PendingButton
                      busy={busy}
                      className="secondary"
                      disabled={!account || role !== "officer"}
                      onClick={() =>
                        instruction("freeze", 0, "Place debit restriction")
                      }
                    >
                      Restrict debits
                    </PendingButton>
                    <PendingButton
                      busy={busy}
                      className="secondary"
                      disabled={!account || role !== "officer"}
                      onClick={() =>
                        instruction("unfreeze", 0, "Release debit restriction")
                      }
                    >
                      Release restriction
                    </PendingButton>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Cash corrections</h2>
                      <p>Reverse the posting; preserve the original record.</p>
                    </div>
                    <RefreshCw size={21} />
                  </div>
                  {data.commands
                    .filter(
                      (c) =>
                        ["deposit", "withdrawal"].includes(c.kind) &&
                        c.status === "posted",
                    )
                    .map((c) => (
                      <div className="request" key={c.id}>
                        <div>
                          <strong>{c.description}</strong>
                          <p>
                            {formatMoney(c.amount_minor / 100)} · Core #
                            {c.core_id}
                          </p>
                        </div>
                        <PendingButton
                          busy={busy}
                          className="secondary"
                          disabled={
                            role !== "officer" ||
                            data.commands.some(
                              (r) =>
                                r.kind === "reverse" &&
                                r.payload.includes(c.id) &&
                                [
                                  "posted",
                                  "pending",
                                  "executing",
                                  "uncertain",
                                ].includes(r.status),
                            )
                          }
                          onClick={() =>
                            instruction(
                              "reverse",
                              0,
                              `Reverse cash posting #${c.core_id}`,
                              { originalId: c.id },
                            )
                          }
                        >
                          Request reversal
                        </PendingButton>
                      </div>
                    ))}
                </section>
              </div>
              <section className="panel spaced">
                <div className="panel-heading">
                  <div>
                    <h2>Instruction register</h2>
                    <p>Every command, including declines and exceptions.</p>
                  </div>
                </div>
                {data.commands.map((c) => (
                  <div className="register-item" key={c.id}>
                    <div>
                      <strong>{c.description}</strong>
                      <small>
                        {c.error ??
                          `Core reference: ${c.core_id ?? "not posted"}`}
                      </small>
                    </div>
                    <span>{formatMoney(c.amount_minor / 100)}</span>
                    <Pill status={c.status} />
                  </div>
                ))}
              </section>
            </>
          )}

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
