"use client";

import { useEffect, useMemo, useState } from "react";
import { planningHouseholds } from "../../../demo/households/planning-fixtures";
import { planningSections } from "../../navigation/ui/portal-routes";
import {
  evaluatePlanningProjection,
  planningMoney as money,
  type PlanningFilter,
  planningDay,
  planningForecast,
  planningMonthRange,
  planningRange,
  planningRows,
  planningTotals,
  planningWealth,
} from "../domain/planning";
import type { PlanningScenario } from "../domain/planning-state";
import { usePlanningRepository } from "./planning-repository";
import "./planning.css";

export const households = planningHouseholds();
export const tabs = [
  "Overview",
  "Cash flow",
  "Goals & retirement",
  "Scenario lab",
  "Insights",
] as const;
type Tab = (typeof tabs)[number];
export const emptyFilter: PlanningFilter = {
  ...planningRange("90"),
  account: "",
  member: "",
  category: "",
  merchant: "",
};

import type { PlanningTab } from "../../navigation/ui/portal-routes";
export function useHouseholdPlanning({
  embedded = false,
  routeTab,
  navigate,
  standalone = false,
}: {
  embedded?: boolean;
  routeTab?: PlanningTab;
  navigate?: (_path: string) => void;
  standalone?: boolean;
}) {
  const [householdId, setHouseholdId] = useState(households[1]!.id);
  const household = households.find((h) => h.id === householdId)!;
  const repository = usePlanningRepository(household, embedded);
  const { state, ready, busy, error, notice, persist, canEdit } = repository;
  const [localTab, updateTab] = useState<Tab>("Overview");
  const tab = routeTab ?? localTab;
  const setTab = (next: Tab) => {
    updateTab(next);
    navigate?.(`/wealth-planning/${planningSections[next]}`);
  };
  const [filter, setFilter] = useState<PlanningFilter>(emptyFilter);
  const [preset, setPreset] = useState("90");
  const [selected, setSelected] = useState("baseline");
  const [editing, setEditing] = useState<PlanningScenario | null>(null);
  const [today, setToday] = useState(true);
  const [drillStack, setDrillStack] = useState<
    { filter: PlanningFilter; preset: string; tab: Tab; origin: string }[]
  >([]);
  const [focusTransactions, setFocusTransactions] = useState(false);
  const [restoreOrigin, setRestoreOrigin] = useState("");
  useEffect(() => {
    setSelected("baseline");
    setEditing(null);
    setDrillStack([]);
    setFocusTransactions(false);
  }, []);
  useEffect(() => {
    if (!state.scenarios.some((s) => s.id === selected))
      setSelected("baseline");
  }, [state.scenarios, selected]);
  useEffect(() => {
    if (ready && focusTransactions && tab === "Cash flow") {
      document.querySelector<HTMLElement>("#planning-transactions h2")?.focus();
      setFocusTransactions(false);
    }
  }, [ready, focusTransactions, tab]);
  useEffect(() => {
    if (restoreOrigin && ready) {
      const element =
        document.querySelector<HTMLElement>(
          `[data-planning-drill="${CSS.escape(restoreOrigin)}"]`,
        ) ?? document.querySelector<HTMLElement>("[data-planning-title]");
      element?.focus();
      setRestoreOrigin("");
    }
  }, [restoreOrigin, ready]);
  const rows = useMemo(
    () => planningRows(household, filter),
    [household, filter],
  );
  const totals = planningTotals(rows);
  const wealth = planningWealth(household);
  const periodDays = Math.max(
    1,
    Math.round((Date.parse(filter.to) - Date.parse(filter.from)) / 86400000) +
      1,
  );
  const previous = {
    ...filter,
    from: planningDay(filter.from, -periodDays),
    to: planningDay(filter.from, -1),
  };
  const previousTotals = planningTotals(planningRows(household, previous));
  const months = [...new Set(rows.map((p) => p.date.slice(0, 7)))];
  const monthly = months.map((month) => ({
    month,
    ...planningTotals(rows.filter((p) => p.date.startsWith(month))),
  }));
  const categories = [
    ...new Set(
      household.postings
        .filter((p) =>
          ["expense", "refund", "reimbursement", "interest"].includes(p.kind),
        )
        .map((p) => p.category),
    ),
  ].sort();
  const categoryTotals = categories
    .map((category) => ({
      category,
      spending: planningTotals(rows.filter((p) => p.category === category))
        .spending,
    }))
    .filter((c) => c.spending !== 0)
    .sort((a, b) => b.spending - a.spending);
  const scenario =
    state.scenarios.find((s) => s.id === selected) ?? state.scenarios[0]!;
  const projectionResult = evaluatePlanningProjection(
    household,
    scenario.assumptions,
  );
  const projection =
    projectionResult._tag === "Right" ? projectionResult.right : [];
  const firstGap = projection.find((p) => p.gap > 0);
  const baselineAssumptions = state.scenarios.find(
    (s) => s.id === "baseline",
  )!.assumptions;
  const retiredBaseline =
    baselineAssumptions.age >= baselineAssumptions.retireAge;
  const forecastIncome = retiredBaseline
    ? baselineAssumptions.pension
    : baselineAssumptions.income;
  const forecastSip = retiredBaseline ? 0 : baselineAssumptions.sip;
  const forecast = planningForecast(household, 90, baselineAssumptions);
  const shortfall = forecast.find((p) => p.balance < 0);
  const nextCommitment = forecast.find((p) => p.date.endsWith("-05"));
  const rememberDrill = (origin: string) =>
    setDrillStack((stack) => [
      ...stack.slice(-19),
      { filter, preset, tab, origin },
    ]);
  const drill = (category: string, origin = `category:${category}`) => {
    rememberDrill(origin);
    setFilter({ ...filter, category });
    setTab("Cash flow");
    setFocusTransactions(true);
  };
  const inspectMonth = (month: string) => {
    rememberDrill(`month:${month}`);
    setPreset("custom");
    setFilter(planningMonthRange(filter, month));
    setFocusTransactions(true);
  };
  const backFromDrill = () => {
    const previous = drillStack.at(-1);
    if (!previous) return;
    setFilter(previous.filter);
    setPreset(previous.preset);
    setTab(previous.tab);
    setDrillStack((stack) => stack.slice(0, -1));
    setRestoreOrigin(previous.origin);
  };
  const daily = (value: number) =>
    Math.round((value * periodDays) / (365 / 12));
  const alerts = [
    ...(nextCommitment && forecastSip + household.debt.emi > 0
      ? [
          {
            id: `commitment:${nextCommitment.date}:${forecastSip + household.debt.emi}`,
            title: `Upcoming planned allocation on ${nextCommitment.date}`,
            detail: `${money(forecastSip)} SIP plus ${money(household.debt.emi)} EMI under the saved baseline monthly assumptions. This is a forecast assumption, not a bank mandate or pending order.`,
            category: "",
          },
        ]
      : []),
    ...(projectionResult._tag === "Left"
      ? [
          {
            id: `calculation:${scenario.id}:${scenario.version}`,
            title: "Projection cannot be calculated exactly",
            detail: projectionResult.left,
            category: "",
          },
        ]
      : []),
    ...categoryTotals
      .filter(
        (c) =>
          state.budgets[c.category] !== undefined &&
          c.spending > daily(state.budgets[c.category]!),
      )
      .map((c) => ({
        id: `budget:${c.category}:${filter.from}:${filter.to}:${filter.account}:${filter.member}:${state.budgets[c.category]}:${c.spending}`,
        title: `${c.category} exceeds the selected-period budget`,
        detail: `${money(c.spending)} recorded versus ${money(daily(state.budgets[c.category]!))} prorated budget. ${rows.filter((p) => p.category === c.category).length} source postings.`,
        category: c.category,
      })),
    {
      id: "stale-epf",
      title: "Provident fund valuation needs a refresh",
      detail:
        "Fictional annual statement dated 31 March 2026. Excluded from available retirement capital; inspect its source in the wealth inventory.",
      category: "",
    },
    ...(firstGap
      ? [
          {
            id: `goal:${scenario.id}:${scenario.version}`,
            title: `Liquid assets first run short in ${firstGap.year}`,
            detail: `${money(firstGap.gap / (today ? firstGap.deflator : 1))} that year; scenario ${scenario.name} v${scenario.version}. Inspect annual income, costs, debt and goals.`,
            category: "",
          },
        ]
      : []),
    ...(shortfall
      ? [
          {
            id: "cash-shortfall",
            title: `Projected cash shortfall on ${shortfall.date}`,
            detail: `${money(shortfall.balance)} under the baseline monthly commitments. Forecast is not a recorded balance.`,
            category: "",
          },
        ]
      : []),
    ...(household.holdings.some((a) => a.minor > wealth.assets * 0.5)
      ? [
          {
            id: "concentration",
            title: "One asset exceeds half of gross wealth",
            detail:
              "Compare the property snapshot with gross assets. A self-occupied home is not treated as spendable retirement capital.",
            category: "",
          },
        ]
      : []),
  ];
  const Container: "main" | "section" = embedded ? "section" : "main";
  const Title: "h1" | "h2" = embedded ? "h2" : "h1";
  return {
    embedded,
    routeTab,
    navigate,
    standalone,
    householdId,
    setHouseholdId,
    household,
    repository,
    state,
    ready,
    busy,
    error,
    notice,
    persist,
    canEdit,
    localTab,
    updateTab,
    tab,
    setTab,
    filter,
    setFilter,
    preset,
    setPreset,
    selected,
    setSelected,
    editing,
    setEditing,
    today,
    setToday,
    drillStack,
    setDrillStack,
    focusTransactions,
    setFocusTransactions,
    restoreOrigin,
    setRestoreOrigin,
    rows,
    totals,
    wealth,
    periodDays,
    previous,
    previousTotals,
    months,
    monthly,
    categories,
    categoryTotals,
    scenario,
    projectionResult,
    projection,
    firstGap,
    baselineAssumptions,
    retiredBaseline,
    forecastIncome,
    forecastSip,
    forecast,
    shortfall,
    nextCommitment,
    rememberDrill,
    drill,
    inspectMonth,
    backFromDrill,
    daily,
    alerts,
    Container,
    Title,
  };
}
