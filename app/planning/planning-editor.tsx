import { useState } from "react";
import type { PlanningAssumptions } from "../../src/domain/planning";
import type { PlanningScenario } from "../../src/domain/planning-state";
export const assumptionFields: {
  key: keyof PlanningAssumptions;
  title: string;
  unit: string;
}[] = [
  { key: "age", title: "Current age", unit: "years" },
  { key: "retireAge", title: "Retirement age", unit: "years" },
  { key: "longevity", title: "Plan through age", unit: "years" },
  { key: "income", title: "Monthly take-home income", unit: "INR" },
  { key: "essential", title: "Monthly essentials", unit: "INR" },
  { key: "discretionary", title: "Monthly discretionary costs", unit: "INR" },
  {
    key: "pension",
    title: "Monthly pension / rent after retirement",
    unit: "INR",
  },
  { key: "dependent", title: "Monthly dependent costs", unit: "INR" },
  { key: "dependentYears", title: "Years of dependent support", unit: "years" },
  { key: "essentialInflation", title: "Essential inflation", unit: "%" },
  {
    key: "discretionaryInflation",
    title: "Discretionary inflation",
    unit: "%",
  },
  { key: "incomeGrowth", title: "Annual income growth", unit: "%" },
  { key: "returnRate", title: "Annual investment return", unit: "%" },
  { key: "fee", title: "Annual fees", unit: "%" },
  { key: "sip", title: "Monthly SIP from surplus", unit: "INR" },
  { key: "sipStep", title: "Annual SIP step-up", unit: "%" },
  { key: "prepayment", title: "Immediate loan prepayment", unit: "INR" },
  { key: "education", title: "Education goal in today's rupees", unit: "INR" },
  { key: "educationYear", title: "Education goal year", unit: "year" },
  { key: "breakYear", title: "Career break / shock year", unit: "year" },
  { key: "breakMonths", title: "Career break duration", unit: "months" },
  { key: "medicalShock", title: "One-off medical shock", unit: "INR" },
  { key: "rentChange", title: "Additional monthly rent", unit: "INR" },
];
export function ScenarioEditor({
  scenario,
  save,
  cancel,
}: {
  scenario: PlanningScenario;
  save: (s: PlanningScenario) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState(scenario);
  const [validation, setValidation] = useState("");
  return (
    <form
      className="wp-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (
          draft.assumptions.retireAge < draft.assumptions.age ||
          draft.assumptions.longevity < draft.assumptions.age
        ) {
          setValidation(
            "Retirement and longevity must be at least your current age.",
          );
          return;
        }
        save({ ...draft, name: draft.name.trim(), version: draft.version + 1 });
      }}
    >
      <h2>Edit scenario assumptions</h2>
      <p>
        Monthly amounts in INR. Percentages are annual. Savings transfers do not
        create additional income.
      </p>
      <label>
        Scenario name
        <input
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <div className="wp-input-grid">
        {assumptionFields.map(({ key, title, unit }) => (
          <label key={key}>
            {title}
            <small>{unit}</small>
            <input
              type="number"
              required
              min={0}
              max={
                unit === "%"
                  ? key === "fee"
                    ? 5
                    : 20
                  : unit === "INR"
                    ? 9000000000
                    : unit === "year"
                      ? 2100
                      : 100
              }
              step={unit === "%" ? 0.01 : 1}
              value={
                Number(draft.assumptions[key]) /
                (unit === "%" || unit === "INR" ? 100 : 1)
              }
              onChange={(e) =>
                setDraft({
                  ...draft,
                  assumptions: {
                    ...draft.assumptions,
                    [key]: Math.round(
                      Number(e.target.value) *
                        (unit === "%" || unit === "INR" ? 100 : 1),
                    ),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="wp-check">
        <input
          type="checkbox"
          checked={draft.assumptions.adverseSequence}
          onChange={(e) =>
            setDraft({
              ...draft,
              assumptions: {
                ...draft.assumptions,
                adverseSequence: e.target.checked,
              },
            })
          }
        />
        Adverse first three retirement returns: −20%, −10%, 0% before fees
      </label>
      {validation && <p role="alert">{validation}</p>}
      <div className="wp-actions">
        <button type="submit">Save scenario v{draft.version + 1}</button>
        <button type="button" className="secondary" onClick={cancel}>
          Cancel edits
        </button>
      </div>
    </form>
  );
}
