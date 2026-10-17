import { useState } from "react";
import type { PlanningState } from "../../src/domain/planning-state";

type Props = {
  category: string;
  state: PlanningState;
  canEdit: boolean;
  persist: (state: PlanningState) => Promise<boolean>;
};
export function PlanningBudgetControls({
  category,
  state,
  canEdit,
  persist,
}: Props) {
  const [source, setSource] = useState("");
  const id = `planning-budget-${state.household}-${encodeURIComponent(category)}`;
  return (
    <>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await persist({
            ...state,
            budgets: {
              ...state.budgets,
              [category]: Math.round(Number(data.get("budget")) * 100),
            },
          });
        }}
      >
        <label className="wp-sr" htmlFor={id}>
          {category} monthly budget INR
        </label>
        <input
          id={id}
          name="budget"
          type="number"
          min="0"
          max="10000000"
          required
          disabled={!canEdit}
          defaultValue={
            state.budgets[category] === undefined
              ? ""
              : state.budgets[category] / 100
          }
          key={state.version}
        />
        <button type="submit" className="secondary" disabled={!canEdit}>
          Save budget
        </button>
      </form>
      <details>
        <summary>Copy or delete this budget</summary>
        <label>
          Copy monthly limit from
          <select
            aria-label={`${category} copy budget from`}
            disabled={!canEdit}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Choose another category</option>
            {Object.keys(state.budgets)
              .filter((name) => name !== category)
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </select>
        </label>
        <div className="wp-actions">
          <button
            type="button"
            className="secondary"
            aria-label={`Copy budget to ${category}`}
            disabled={!canEdit || state.budgets[source] === undefined}
            onClick={() => {
              const value = state.budgets[source];
              if (value !== undefined)
                void persist({
                  ...state,
                  budgets: { ...state.budgets, [category]: value },
                });
            }}
          >
            Copy monthly limit
          </button>
          {state.budgets[category] !== undefined && (
            <button
              type="button"
              className="secondary"
              aria-label={`Delete ${category} budget`}
              disabled={!canEdit}
              onClick={() => {
                const budgets = { ...state.budgets };
                delete budgets[category];
                void persist({ ...state, budgets });
              }}
            >
              Delete budget
            </button>
          )}
        </div>
      </details>
    </>
  );
}
