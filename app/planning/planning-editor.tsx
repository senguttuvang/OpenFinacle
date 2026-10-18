import { useState } from "react";
import {
  type PlanningAssumptions,
  planningRetirementStart,
} from "../../src/domain/planning";
import type { PlanningScenario } from "../../src/domain/planning-state";
import { FormSelect } from "../form-select";
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
  {
    key: "educationYear",
    title: "Education goal period end year",
    unit: "year",
  },
  {
    key: "breakYear",
    title: "Career break / shock period end year",
    unit: "year",
  },
  { key: "breakMonths", title: "Career break duration", unit: "months" },
  { key: "medicalShock", title: "One-off medical shock", unit: "INR" },
  { key: "rentChange", title: "Additional monthly rent", unit: "INR" },
];
export function ScenarioEditor({
  scenario,
  save,
  cancel,
  disabled,
}: {
  scenario: PlanningScenario;
  save: (s: PlanningScenario) => void;
  cancel: () => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(scenario);
  const [validation, setValidation] = useState("");
  return (
    <form
      className="wp-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (draft.assumptions.longevity < draft.assumptions.age) {
          setValidation(
            "The planning horizon must be at least your current age. Past retirement ages are valid for an already-retired household.",
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
          disabled={disabled}
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <div className="wp-input-grid">
        <label>
          Retirement start (annual boundary)
          <FormSelect
            aria-label="Retirement start (annual boundary)"
            disabled={disabled}
            value={String(draft.assumptions.retireAge)}
            onValueChange={(value) =>
              setDraft({
                ...draft,
                assumptions: {
                  ...draft.assumptions,
                  retireAge: Number(value),
                },
              })
            }
            options={Array.from({ length: 61 }, (_, index) => index + 25).map(
              (age) => ({
                value: String(age),
                label: `${planningRetirementStart({
                  age: draft.assumptions.age,
                  retireAge: age,
                })} · age ${age}`,
              }),
            )}
          />
          <small>
            Linked to retirement age. Annual model boundaries; past dates
            represent an already-retired household.
          </small>
        </label>
        {assumptionFields.map(({ key, title, unit }) => (
          <label key={key}>
            {title}
            <small>{unit}</small>
            <input
              type="number"
              disabled={disabled}
              required
              min={
                key === "age" || key === "retireAge"
                  ? 25
                  : key === "longevity"
                    ? 60
                    : unit === "year"
                      ? 2026
                      : 0
              }
              max={
                key === "age" || key === "retireAge"
                  ? 85
                  : key === "dependentYears"
                    ? 50
                    : key === "breakMonths"
                      ? 24
                      : unit === "%"
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
          disabled={disabled}
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
        <button type="submit" disabled={disabled}>
          Save scenario v{draft.version + 1}
        </button>
        <button type="button" className="secondary" onClick={cancel}>
          Cancel edits
        </button>
      </div>
    </form>
  );
}
