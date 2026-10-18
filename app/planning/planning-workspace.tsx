"use client";

import { ArrowLeft, Check, Landmark } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  evaluatePlanningProjection,
  planningMoney as money,
  type PlanningFilter,
  planningAnchor,
  planningDay,
  planningForecast,
  planningMonthRange,
  planningRange,
  planningRows,
  planningTotals,
  planningWealth,
} from "../../src/domain/planning";
import { planningHouseholds } from "../../src/domain/planning-fixtures";
import type { PlanningScenario } from "../../src/domain/planning-state";
import { ReadingSize } from "../reading-size";
import { PlanningBudgetControls } from "./planning-budget-controls";
import { PlanningFilters } from "./planning-filters";
import { PlanningOverview } from "./planning-overview";
import { PlanningProjection } from "./planning-projection";
import { usePlanningRepository } from "./planning-repository";
import { PlanningSource } from "./planning-source";
import { Transactions } from "./planning-transactions";
import { Trend } from "./planning-trend";
import "./planning.css";

const households = planningHouseholds();
const tabs = [
  "Overview",
  "Cash flow",
  "Goals & retirement",
  "Scenario lab",
  "Insights",
] as const;
type Tab = (typeof tabs)[number];
const emptyFilter: PlanningFilter = {
  ...planningRange("90"),
  account: "",
  member: "",
  category: "",
  merchant: "",
};
export function PlanningWorkspace({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [householdId, setHouseholdId] = useState(households[1]!.id);
  const household = households.find((h) => h.id === householdId)!;
  const repository = usePlanningRepository(household, embedded);
  const { state, ready, busy, error, notice, persist, canEdit } = repository;
  const [tab, setTab] = useState<Tab>("Overview");
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: switching household or source deliberately resets the local editor selection.
  useEffect(() => {
    setSelected("baseline");
    setEditing(null);
    setDrillStack([]);
    setFocusTransactions(false);
  }, [household.id, repository.mode]);
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
  const Container = embedded ? "section" : "main";
  const Title = embedded ? "h2" : "h1";
  return (
    <Container
      className={`wealth-planning${embedded ? " wp-embedded" : ""}`}
      aria-label="Household wealth and planning"
      aria-busy={busy}
    >
      {!embedded && (
        <header className="wp-header">
          <a href="/" className="wp-brand">
            <Landmark size={26} />
            OpenFinacle<span>Wealth & Planning</span>
          </a>
          <ReadingSize />
        </header>
      )}
      <div className="wp-demo">
        <strong>Synthetic demonstration</strong>
        <span>
          Invented Indian households · recorded through {planningAnchor} · INR ·
          no real bank data
        </span>
      </div>
      <div className="wp-title">
        <div>
          <Title tabIndex={-1} data-planning-title>
            A clearer view of your household
          </Title>
          <p>
            Understand what you have, where it goes, and what could come next.
          </p>
        </div>
        <label>
          Household
          <select
            value={householdId}
            onChange={(e) => {
              setHouseholdId(e.target.value);
              setFilter(emptyFilter);
            }}
            aria-label="Household"
            disabled={busy}
          >
            {households.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} · {h.city}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="wp-context">
        <strong>{household.name}</strong>
        <span>
          {household.description} · {household.members.join(" & ")}
        </span>
        <span>{household.postings.length} recorded postings</span>
      </div>
      <nav className="wp-tabs" aria-label="Planning sections">
        {tabs.map((name) => (
          <button
            type="button"
            key={name}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => {
              setTab(name);
              setEditing(null);
            }}
          >
            {name}
            {name === "Insights" && (
              <span>
                {
                  alerts.filter((a) => !state.acknowledged.includes(a.id))
                    .length
                }
              </span>
            )}
          </button>
        ))}
      </nav>
      <PlanningSource repository={repository} embedded={embedded} />
      <div aria-live="polite">
        {notice && (
          <p className="wp-notice">
            <Check size={18} />
            {notice}
          </p>
        )}
      </div>
      {error && (
        <p className="wp-error" role="alert">
          {error} Reload to recover; saved records have not been reset.
        </p>
      )}
      {!ready ? (
        <p className="wp-empty">
          {error
            ? "Planning edits are unavailable until saved data can be verified."
            : "Loading saved household planning…"}
        </p>
      ) : (
        <>
          {(tab === "Overview" ||
            tab === "Cash flow" ||
            tab === "Insights") && (
            <PlanningFilters
              household={household}
              filter={filter}
              preset={preset}
              previous={previous}
              setPreset={setPreset}
              setFilter={setFilter}
              clearFilters={() => {
                setFilter(emptyFilter);
                setPreset("90");
              }}
            />
          )}
          {tab === "Overview" && (
            <PlanningOverview
              household={household}
              assumptions={baselineAssumptions}
              totals={totals}
              onCashFlow={() => setTab("Cash flow")}
            />
          )}
          {tab === "Cash flow" && (
            <>
              <section className="wp-panel">
                <h2>From income to available cash</h2>
                <dl className="wp-summary">
                  <div>
                    <dt>Income</dt>
                    <dd>{money(totals.income)}</dd>
                    <small>Previous {money(previousTotals.income)}</small>
                  </div>
                  <div>
                    <dt>Consumption</dt>
                    <dd>{money(totals.spending)}</dd>
                    <small>Previous {money(previousTotals.spending)}</small>
                  </div>
                  <div>
                    <dt>Investment allocations</dt>
                    <dd>{money(totals.investing)}</dd>
                  </div>
                  <div>
                    <dt>Loan principal</dt>
                    <dd>{money(totals.principal)}</dd>
                  </div>
                </dl>
                <p>
                  Net cash movement: <strong>{money(totals.movement)}</strong>.
                  A single-account filter includes transfers across that
                  account's boundary. Card purchases are consumption; settlement
                  is a transfer.
                </p>
                {monthly.length ? (
                  <Trend
                    labels={months}
                    series={[
                      {
                        id: "recorded-income",
                        name: "Income",
                        values: monthly.map((m) => m.income),
                        color: "#2458d3",
                      },
                      {
                        id: "recorded-consumption",
                        name: "Consumption",
                        values: monthly.map((m) => m.spending),
                        color: "#9a4b0d",
                      },
                    ]}
                    caption="Recorded monthly income and consumption · INR · selected filters"
                  />
                ) : (
                  <p className="wp-empty">No recorded values for this range.</p>
                )}
                <details>
                  <summary>Monthly values and drill-down</summary>
                  <div className="wp-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Income</th>
                          <th>Consumption</th>
                          <th>Investing</th>
                          <th>Inspect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.map((m) => (
                          <tr key={m.month}>
                            <td>{m.month}</td>
                            <td>{money(m.income)}</td>
                            <td>{money(m.spending)}</td>
                            <td>{money(m.investing)}</td>
                            <td>
                              <button
                                type="button"
                                className="secondary"
                                data-planning-drill={`month:${m.month}`}
                                onClick={() => inspectMonth(m.month)}
                              >
                                Inspect month
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
              <section className="wp-panel">
                <h2>Category budgets versus recorded consumption</h2>
                <p>
                  Monthly budgets prorate by selected calendar days / (365 ÷
                  12). Comparison respects every filter; a narrow
                  merchant/member filter is only part of a household budget.
                </p>
                {filter.category && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setFilter({ ...filter, category: "" })}
                  >
                    <ArrowLeft size={18} />
                    All categories in current dates
                  </button>
                )}
                <div className="wp-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Actual / period allowance</th>
                        <th>Monthly budget INR</th>
                        <th>Sources</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryTotals.map((c) => (
                        <tr key={c.category}>
                          <td>
                            {c.category}
                            <div
                              className={`wp-bar-track ${c.spending > daily(state.budgets[c.category] ?? Number.MAX_SAFE_INTEGER) ? "wp-over" : ""}`}
                            >
                              <span
                                style={{
                                  width: `${Math.max(0, Math.min(100, (c.spending / Math.max(1, daily(state.budgets[c.category] ?? c.spending))) * 100))}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            {money(c.spending)}
                            <small>
                              {state.budgets[c.category] === undefined
                                ? "No budget set"
                                : `Allowance ${money(daily(state.budgets[c.category]!))} · ${c.spending > daily(state.budgets[c.category]!) ? "Over budget" : "Within budget"}`}
                            </small>
                          </td>
                          <td>
                            <PlanningBudgetControls
                              category={c.category}
                              state={state}
                              canEdit={canEdit}
                              persist={persist}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary"
                              data-planning-drill={`category:${c.category}`}
                              onClick={() => drill(c.category)}
                            >
                              View postings
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="wp-panel" id="planning-transactions">
                <h2 tabIndex={-1}>Source transactions</h2>
                {drillStack.length > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={backFromDrill}
                  >
                    <ArrowLeft size={18} />
                    Back to previous view
                  </button>
                )}
                <p>
                  {filter.category || "All categories"} · {filter.from}–
                  {filter.to}. Filtered consumption total:{" "}
                  <strong>{money(totals.spending)}</strong>
                </p>
                <Transactions
                  key={`${householdId}-${JSON.stringify(filter)}`}
                  rows={rows}
                />
              </section>
              <section className="wp-panel">
                <h2>90-day forecast & recurring commitments</h2>
                <p>
                  18 October 2026 onwards; independent of recorded filters.
                  Income / pension {money(forecastIncome)} on day 1, SIP{" "}
                  {money(forecastSip)} and EMI {money(household.debt.emi)} on
                  day 5. Living and dependent costs spread daily at annual cost
                  / 365. No prediction of market prices, professional invoice
                  timing or unmodeled seasonal bills. All cash after card
                  liabilities is treated as available; reserve accounts are not
                  protected. Career breaks, prepayment and one-off shocks belong
                  to the annual scenario view.
                </p>
                <Trend
                  labels={forecast.map((p) => p.date)}
                  series={[
                    {
                      id: "forecast-balance",
                      name: "Assumed cash balance",
                      values: forecast.map((p) => p.balance),
                      color: "#2458d3",
                    },
                  ]}
                  caption="Baseline forecast cash · deterministic assumptions · not recorded transactions"
                />
                <details>
                  <summary>Daily forecast ledger</summary>
                  <div className="wp-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Future date</th>
                          <th>Assumed income</th>
                          <th>Assumed costs / allocations</th>
                          <th>Projected cash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forecast.map((p) => (
                          <tr key={p.date}>
                            <td>{p.date}</td>
                            <td>{money(p.income)}</td>
                            <td>{money(p.expense)}</td>
                            <td>{money(p.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            </>
          )}
          {(tab === "Goals & retirement" || tab === "Scenario lab") && (
            <PlanningProjection
              household={household}
              state={state}
              persist={persist}
              canEdit={canEdit}
              selected={selected}
              setSelected={setSelected}
              editing={editing}
              setEditing={setEditing}
              today={today}
              setToday={setToday}
              tab={tab}
            />
          )}
          {tab === "Insights" && (
            <section className="wp-panel">
              <h2>Insights you can explain</h2>
              <p>
                Calculated from selected postings and saved model inputs.
                Acknowledgments persist in the selected data source. No
                notification or payment is sent.
              </p>
              {alerts.map((alert) => (
                <article
                  className={`wp-insight ${state.acknowledged.includes(alert.id) ? "wp-ack" : ""}`}
                  key={alert.id}
                >
                  <div>
                    <h3>{alert.title}</h3>
                    <p>{alert.detail}</p>
                  </div>
                  <div className="wp-actions">
                    <button
                      type="button"
                      className="secondary"
                      data-planning-drill={`insight:${alert.id}`}
                      onClick={() => {
                        if (alert.category)
                          drill(alert.category, `insight:${alert.id}`);
                        else
                          setTab(
                            alert.id.startsWith("goal") ||
                              alert.id.startsWith("calculation")
                              ? "Goals & retirement"
                              : alert.id === "cash-shortfall" ||
                                  alert.id.startsWith("commitment")
                                ? "Cash flow"
                                : "Overview",
                          );
                      }}
                    >
                      Inspect source
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canEdit}
                      onClick={() =>
                        persist({
                          ...state,
                          acknowledged: state.acknowledged.includes(alert.id)
                            ? state.acknowledged.filter((id) => id !== alert.id)
                            : [...state.acknowledged.slice(-99), alert.id],
                        })
                      }
                    >
                      {state.acknowledged.includes(alert.id)
                        ? "Reopen insight"
                        : "Acknowledge"}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      <footer className="wp-footer">
        Synthetic planning is separate from Fineract-backed banking. Model
        outputs illustrate assumptions and are not investment recommendations.
        Dataset anchor: {planningAnchor}. No live market feed.
      </footer>
    </Container>
  );
}
