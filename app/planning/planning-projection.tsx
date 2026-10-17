import { Copy, Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  evaluatePlanningProjection,
  planningMoney as money,
  type PlanningHousehold,
  planningRetirementStart,
} from "../../src/domain/planning";
import type {
  PlanningScenario,
  PlanningState,
} from "../../src/domain/planning-state";
import { assumptionFields, ScenarioEditor } from "./planning-editor";
import { Trend } from "./planning-trend";

const amount = (minor: number) => money(Math.round(minor));
type Props = {
  household: PlanningHousehold;
  state: PlanningState;
  persist: (state: PlanningState) => Promise<boolean>;
  canEdit: boolean;
  selected: string;
  setSelected: (id: string) => void;
  editing: PlanningScenario | null;
  setEditing: Dispatch<SetStateAction<PlanningScenario | null>>;
  today: boolean;
  setToday: (today: boolean) => void;
  tab: string;
};
export function PlanningProjection({
  household,
  state,
  persist,
  canEdit,
  selected,
  setSelected,
  editing,
  setEditing,
  today,
  setToday,
  tab,
}: Props) {
  const scenario =
    state.scenarios.find((s) => s.id === selected) ?? state.scenarios[0]!;
  const baseline = state.scenarios.find((s) => s.id === "baseline")!;
  const selectedResult = evaluatePlanningProjection(
    household,
    scenario.assumptions,
  );
  const baselineResult = evaluatePlanningProjection(
    household,
    baseline.assumptions,
  );
  if (selectedResult._tag === "Left" || baselineResult._tag === "Left")
    return (
      <section className="wp-panel">
        <h2>Projection needs revised assumptions</h2>
        <p role="alert">
          These assumptions exceed the model's exact paise range. Reduce the
          amounts, growth rates or planning horizon.
        </p>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() =>
            setEditing(selectedResult._tag === "Left" ? scenario : baseline)
          }
        >
          Edit assumptions
        </button>
        {editing && (
          <ScenarioEditor
            key={editing.id}
            scenario={editing}
            cancel={() => setEditing(null)}
            disabled={!canEdit}
            save={async (s) => {
              if (
                await persist({
                  ...state,
                  scenarios: state.scenarios.map((item) =>
                    item.id === s.id ? s : item,
                  ),
                })
              )
                setEditing(null);
            }}
          />
        )}
      </section>
    );
  const projection = selectedResult.right;
  const baselineProjection = baselineResult.right;
  const firstGap = projection.find((p) => p.gap > 0);
  const gap = projection.reduce(
    (sum, p) => sum + Math.round(p.gap / (today ? p.deflator : 1)),
    0,
  );
  return (
    <>
      <section className="wp-panel">
        <div className="wp-section-head">
          <div>
            <h2>
              {tab === "Scenario lab"
                ? "Explore a different future"
                : "Goals and retirement cash flow"}
            </h2>
            <p>
              Deterministic model india-household-v1 · annual periods ending 17
              October, first in 2027 · assumptions, not financial advice.
            </p>
          </div>
          <label className="wp-check">
            <input
              type="checkbox"
              checked={today}
              onChange={(e) => setToday(e.target.checked)}
            />
            Today's rupees
          </label>
        </div>
        <div className="wp-actions">
          <label>
            Saved scenario
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setEditing(null);
              }}
            >
              {state.scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · v{s.version}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setEditing(scenario)}
          >
            Edit assumptions
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!canEdit || state.scenarios.length >= 20}
            onClick={async () => {
              const copy = {
                ...scenario,
                id: crypto.randomUUID(),
                name: `${scenario.name.slice(0, 64)} copy`,
                version: 0,
                assumptions: { ...scenario.assumptions },
              };
              if (
                await persist({
                  ...state,
                  scenarios: [...state.scenarios, copy],
                })
              ) {
                setSelected(copy.id);
                setEditing(copy);
              }
            }}
          >
            <Copy size={18} />
            Duplicate
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!canEdit || state.scenarios.length >= 20}
            onClick={async () => {
              const copy = {
                ...baseline,
                id: crypto.randomUUID(),
                name: "New alternative",
                version: 0,
                assumptions: { ...baseline.assumptions },
              };
              if (
                await persist({
                  ...state,
                  scenarios: [...state.scenarios, copy],
                })
              ) {
                setSelected(copy.id);
                setEditing(copy);
              }
            }}
          >
            <Plus size={18} />
            New
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!canEdit || selected === "baseline"}
            onClick={async () => {
              if (
                await persist({
                  ...state,
                  scenarios: state.scenarios.filter((s) => s.id !== selected),
                })
              )
                setSelected("baseline");
            }}
          >
            <Trash2 size={18} />
            Delete
          </button>
        </div>
        {editing && (
          <ScenarioEditor
            key={editing.id}
            scenario={editing}
            cancel={() => setEditing(null)}
            disabled={!canEdit}
            save={async (s) => {
              if (
                await persist({
                  ...state,
                  scenarios: state.scenarios.map((item) =>
                    item.id === s.id ? s : item,
                  ),
                })
              )
                setEditing(null);
            }}
          />
        )}
        <dl className="wp-summary wp-projection-summary">
          <div>
            <dt>Retirement age</dt>
            <dd>{scenario.assumptions.retireAge}</dd>
            <small>
              Phase starts {planningRetirementStart(scenario.assumptions)} ·
              annual boundary
            </small>
          </div>
          <div>
            <dt>First unfunded year</dt>
            <dd>{firstGap ? firstGap.year : "None modeled"}</dd>
          </div>
          <div>
            <dt>Cumulative funding gap</dt>
            <dd>{amount(gap)}</dd>
            <small>
              {today
                ? "Deflated annual gaps summed"
                : "Nominal annual gaps summed"}
            </small>
          </div>
          <div>
            <dt>Available opening capital</dt>
            <dd>{money(projection[0]!.opening)}</dd>
            <small>After limited prepayment</small>
          </div>
        </dl>
        <Trend
          labels={projection.map((p) => String(p.year))}
          series={[
            {
              id: "selected-projection",
              name: scenario.name,
              values: projection.map(
                (p) => p.closing / (today ? p.deflator : 1),
              ),
              color: "#2458d3",
            },
            {
              id: "baseline-projection",
              name: "Baseline",
              values: baselineProjection
                .slice(0, projection.length)
                .map((p) => p.closing / (today ? p.deflator : 1)),
              color: "#8b5599",
            },
          ]}
          caption={`Year-end available assets · ${today ? "today's INR" : "future nominal INR"} · no assumed home sale or locked-fund withdrawal`}
        />
        <details>
          <summary>Inspect every saved assumption</summary>
          <dl className="wp-assumptions">
            {assumptionFields.map((f) => (
              <div key={f.key}>
                <dt>{f.title}</dt>
                <dd>
                  {f.unit === "INR"
                    ? money(Number(scenario.assumptions[f.key]))
                    : `${Number(scenario.assumptions[f.key]) / (f.unit === "%" ? 100 : 1)} ${f.unit}`}
                </dd>
              </div>
            ))}
            <div>
              <dt>Adverse early sequence</dt>
              <dd>
                {scenario.assumptions.adverseSequence
                  ? "−20%, −10%, 0%, before fees"
                  : "Off"}
              </dd>
            </div>
          </dl>
        </details>
        <p className="wp-method">
          Opening capital earns the specified annual return less fees; SIP
          allocated from positive surplus earns a half-year return. Remaining
          surplus is retained without extra intra-year interest. Essential costs
          and education inflate separately from discretionary costs. Pensions
          stay nominal. Debt amortizes monthly at{" "}
          {(household.debt.rate / 100).toFixed(2)}
          %; EMI stays fixed after prepayment, shortening tenure. Shortfalls
          remain unfunded. Tax reserves are illustrative, not a tax-law
          calculation. No probability of success is claimed.
        </p>
      </section>
      <section className="wp-panel">
        <h2>Annual details & baseline differences</h2>
        <p>
          {today
            ? "Amounts deflated to today's INR using the selected scenario's essential inflation; baseline uses its own inflation."
            : "Nominal INR in each future year."}{" "}
          Rounded display; exact paise retained in model.
        </p>
        <div className="wp-table">
          <table>
            <thead>
              <tr>
                <th>Period end year / start age</th>
                <th>Income</th>
                <th>Living / dependent costs</th>
                <th>Debt paid</th>
                <th>Goals / shocks</th>
                <th>Growth after fee</th>
                <th>Closing / baseline delta</th>
                <th>Unfunded gap</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((p, index) => {
                const divisor = today ? p.deflator : 1;
                const base = baselineProjection[index];
                return (
                  <tr key={p.year}>
                    <td>
                      {p.year}
                      <small>Age {p.age}</small>
                    </td>
                    <td>{amount(p.income / divisor)}</td>
                    <td>{amount((p.essential + p.discretionary) / divisor)}</td>
                    <td>
                      {amount(p.debtPayment / divisor)}
                      <small>
                        Remaining {amount(p.debt / divisor)}
                        {base && (
                          <>
                            {" "}
                            · baseline{" "}
                            {amount(base.debt / (today ? base.deflator : 1))}
                          </>
                        )}
                      </small>
                    </td>
                    <td>{amount(p.goals / divisor)}</td>
                    <td>{amount(p.growth / divisor)}</td>
                    <td>
                      {amount(p.closing / divisor)}
                      <small>
                        {base ? (
                          <>
                            Baseline{" "}
                            {amount(base.closing / (today ? base.deflator : 1))}
                            <br />Δ{" "}
                            {amount(
                              p.closing / divisor -
                                base.closing / (today ? base.deflator : 1),
                            )}
                          </>
                        ) : (
                          "Baseline horizon ended"
                        )}
                      </small>
                    </td>
                    <td>{amount(p.gap / divisor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
