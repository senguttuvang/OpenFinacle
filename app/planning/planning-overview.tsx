import { ArrowUpRight, ChevronRight } from "lucide-react";
import {
  planningMoney as money,
  type PlanningHousehold,
  planningAnchor,
  planningBalances,
  planningForecast,
  type planningTotals,
  planningWealth,
  planningWealthHistory,
} from "../../src/domain/planning";
import { Trend } from "./planning-trend";

type Props = {
  household: PlanningHousehold;
  totals: ReturnType<typeof planningTotals>;
  onCashFlow: () => void;
};
export function PlanningOverview({ household, totals, onCashFlow }: Props) {
  const wealth = planningWealth(household);
  const forecast = planningForecast(household);
  const shortfall = forecast.find((p) => p.balance < 0);
  const history = planningWealthHistory(household);
  return (
    <>
      <section className="wp-wealth">
        <div>
          <h2>Household net worth</h2>
          <strong className="wp-total">{money(wealth.net)}</strong>
          <p>
            Assets {money(wealth.assets)} less home loan{" "}
            {money(household.debt.principal)}.<br />
            Synthetic valuations as of 17 October 2026 unless stated.
          </p>
        </div>
        <dl>
          <div>
            <dt>Cash after card liability</dt>
            <dd>{money(wealth.cash)}</dd>
          </div>
          <div>
            <dt>Liquid + investable capital</dt>
            <dd>{money(wealth.investable)}</dd>
          </div>
          <div>
            <dt>Home / locked assets</dt>
            <dd>{money(wealth.assets - wealth.investable)}</dd>
          </div>
        </dl>
      </section>
      <div className="wp-columns">
        <section className="wp-panel">
          <h2>Your selected-period cash flow</h2>
          <dl className="wp-summary">
            <div>
              <dt>Income</dt>
              <dd>{money(totals.income)}</dd>
            </div>
            <div>
              <dt>Consumption incl. interest</dt>
              <dd>{money(totals.spending)}</dd>
            </div>
            <div>
              <dt>Investing</dt>
              <dd>{money(totals.investing)}</dd>
            </div>
            <div>
              <dt>Loan principal</dt>
              <dd>{money(totals.principal)}</dd>
            </div>
          </dl>
          <p>
            Surplus before investing and principal:{" "}
            <strong>{money(totals.income - totals.spending)}</strong>
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => onCashFlow()}
          >
            Inspect recorded cash flow <ArrowUpRight size={18} />
          </button>
        </section>
        <section className="wp-panel wp-mint">
          <h2>The next 90 days</h2>
          <p>
            Baseline commitments applied to today's synthetic cash. Future
            assumptions; no pending bank orders.
          </p>
          <dl className="wp-summary">
            <div>
              <dt>Projected closing cash</dt>
              <dd>{money(forecast.at(-1)!.balance)}</dd>
            </div>
            <div>
              <dt>Lowest projected cash</dt>
              <dd>{money(Math.min(...forecast.map((p) => p.balance)))}</dd>
            </div>
          </dl>
          <p>
            {shortfall
              ? `First shortfall: ${shortfall.date}`
              : "No cash deficit under these assumptions."}
          </p>
          <button
            type="button"
            className="secondary"
            onClick={() => onCashFlow()}
          >
            Inspect forecast & commitments <ChevronRight size={18} />
          </button>
        </section>
      </div>
      <section className="wp-panel">
        <h2>Wealth inventory & ownership</h2>
        <p>
          Fictional snapshots, never live quotes. Joint holdings appear once.
          Unrealised differences are not annualised performance; XIRR is
          unavailable without eligible valuation and flow evidence.
        </p>
        <div className="wp-table">
          <table>
            <thead>
              <tr>
                <th>Asset / source</th>
                <th>Owner / liquidity</th>
                <th>Value</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {planningBalances(household).map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.label}
                    <small>Opening {money(a.opening)} + signed postings</small>
                  </td>
                  <td>
                    {a.owners}
                    <small>
                      {a.closing < 0
                        ? "Card liability, netted in cash"
                        : "Liquid cash"}
                    </small>
                  </td>
                  <td>{money(a.closing)}</td>
                  <td>{planningAnchor}</td>
                </tr>
              ))}
              {household.holdings.map((h) => (
                <tr key={h.id}>
                  <td>
                    {h.name}
                    <small>
                      {h.source} · {h.units}
                    </small>
                  </td>
                  <td>
                    {h.owner}
                    <small>{h.liquidity}</small>
                  </td>
                  <td>
                    {money(h.minor)}
                    <small>Illustrative cost {money(h.cost)}</small>
                  </td>
                  <td>{h.asOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="wp-panel">
        <h2>Asset allocation</h2>
        <p>Gross asset values; home loan is shown separately above.</p>
        {household.holdings.map((h) => (
          <div className="wp-allocation" key={h.id}>
            <span>{h.category}</span>
            <div className="wp-bar-track">
              <span
                style={{
                  width: `${Math.max(0, (h.minor / wealth.assets) * 100)}%`,
                }}
              />
            </div>
            <strong>
              {money(h.minor)} · {((h.minor / wealth.assets) * 100).toFixed(1)}%
            </strong>
          </div>
        ))}
        <div className="wp-allocation">
          <span>Net cash</span>
          <div className="wp-bar-track">
            <span
              style={{
                width: `${Math.max(0, (wealth.cash / wealth.assets) * 100)}%`,
              }}
            />
          </div>
          <strong>
            {money(wealth.cash)} ·{" "}
            {((wealth.cash / wealth.assets) * 100).toFixed(1)}%
          </strong>
        </div>
      </section>
      <section className="wp-panel">
        <h2>Net worth through time</h2>
        <p>
          Synthetic historical reconstruction, separate from future projections.
          Cash follows recorded postings; debt reverses recorded principal.
          Investable valuations use an illustrative 5% annual path after
          contributions, anchored to the current snapshot. Home and locked asset
          estimates are held flat. These are invented valuation assumptions, not
          observed market returns.
        </p>
        <Trend
          labels={history.map((p) => p.date.slice(0, 7))}
          series={[
            {
              name: "Net worth",
              values: history.map((p) => p.net),
              color: "#2458d3",
            },
            {
              name: "Investable holdings",
              values: history.map((p) => p.capital),
              color: "#176045",
            },
          ]}
          caption="Synthetic monthly wealth reconstruction · INR · all household history"
        />
        <details>
          <summary>Monthly source reconciliation</summary>
          <div className="wp-table">
            <table>
              <thead>
                <tr>
                  <th>As of</th>
                  <th>Net worth</th>
                  <th>Net cash</th>
                  <th>Investable holdings</th>
                  <th>Contributions</th>
                  <th>Assumed valuation change</th>
                  <th>Loan principal</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.date}>
                    <td>{p.date}</td>
                    <td>{money(p.net)}</td>
                    <td>{money(p.cash)}</td>
                    <td>{money(p.capital)}</td>
                    <td>{money(p.contribution)}</td>
                    <td>{money(p.valuation)}</td>
                    <td>{money(p.debt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}
