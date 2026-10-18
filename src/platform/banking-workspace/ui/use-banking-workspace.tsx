"use client";

import { Effect } from "effect";
import { ArrowRight, Landmark, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProductStory } from "../../../site/product/product-story";
import { CustomerPicker } from "../../customers/ui/customer-picker";
import {
  viewLabels as labels,
  navigationFor,
  type View,
} from "../../navigation/ui/navigation";
import { usePortalLocation } from "../../navigation/ui/portal-location";
import {
  resolvePortalRoute,
  routeAllowed,
  viewPaths,
} from "../../navigation/ui/portal-routes";
import { initializeTelemetry } from "../../observability/ui/telemetry";
import type { CommandKind, Role } from "../domain/banking";
import type { Dashboard } from "../domain/view";
import { api, setApiCustomerScope } from "./api";
import { PendingButton, roles } from "./workspace-presentation";
export function useBankingWorkspace({
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
  const view: View | "forbidden" | "family" | "unavailable" =
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
          if (path === "/") setView("overview");
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
            if (data || path === "/") setView("overview");
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
    return {
      kind: "entry" as const,
      content: (
        <main className="loading">
          <Landmark size={35} />
          <p>Connecting your banking workspace…</p>
          <LoaderCircle className="spin" />
        </main>
      ),
    };
  if (!data)
    return {
      kind: "entry" as const,
      content: (
        <main className="product-landing">
          <ProductStory>
            {path !== "/" && (
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
                    New customer · staged synthetic application and staff
                    review.
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
          </ProductStory>
        </main>
      ),
    };
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
  const customerNav = [
    "statements",
    "cards",
    "planning",
    "application",
  ] as const;
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
  return {
    kind: "workspace" as const,
    context: {
      initialPicker,
      initialFresh,
      resetWorkspace,
      chooseCustomer,
      setChooseCustomer,
      data,
      setData,
      path,
      navigate,
      route,
      retailItem,
      allowed,
      view,
      setView,
      busy,
      setBusy,
      startupStage,
      setStartupStage,
      loading,
      setLoading,
      error,
      setError,
      toast,
      setToast,
      search,
      setSearch,
      form,
      setForm,
      amount,
      setAmount,
      note,
      setNote,
      cashKind,
      setCashKind,
      cashAmount,
      setCashAmount,
      reviewNote,
      setReviewNote,
      beneficiaryName,
      setBeneficiaryName,
      otp,
      setOtp,
      serviceSearch,
      setServiceSearch,
      load,
      perform,
      startJourney,
      selectCustomer,
      changeRole,
      instruction,
      attach,
      sampleDocs,
      role,
      staff,
      retail,
      account,
      balance,
      pending,
      activeBeneficiary,
      transactions,
      navigation,
      viewTitle,
      customerNav,
      journeySteps,
      progress,
      onboardingNextStep,
      nextStep,
    },
  };
}
export type WorkspaceContext = Extract<
  ReturnType<typeof useBankingWorkspace>,
  { kind: "workspace" }
>["context"];
