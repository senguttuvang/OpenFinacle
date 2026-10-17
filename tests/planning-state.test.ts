import { expect, test } from "bun:test";
import { Effect } from "effect";
import { planningHouseholds } from "../src/domain/planning-fixtures";
import {
  initialPlanningState,
  transitionPlanningState,
  validatePlanningState,
} from "../src/domain/planning-state";

const h = planningHouseholds()[0]!;
test("state rejects household leaks, invalid versions and assumptions, preserves independent snapshots", () => {
  const state = initialPlanningState(h);
  const changed = {
    ...state,
    budgets: { Groceries: 400000 },
    scenarios: state.scenarios.map((s) =>
      s.id === "step-up"
        ? { ...s, version: 1, assumptions: { ...s.assumptions, sipStep: 1200 } }
        : s,
    ),
  };
  const next = Effect.runSync(transitionPlanningState(state, changed));
  expect(
    Effect.runSync(
      Effect.either(
        validatePlanningState(
          { ...state, unexpectedFutureField: "preserve me" },
          h.id,
        ),
      ),
    )._tag,
  ).toBe("Left");
  const invalidRevision = {
    ...changed,
    scenarios: changed.scenarios.map((s) => ({ ...s, version: 25 })),
  };
  expect(
    Effect.runSync(
      Effect.either(transitionPlanningState(state, invalidRevision)),
    )._tag,
  ).toBe("Left");
  expect(next.version).toBe(1);
  expect(
    next.scenarios.find((s) => s.id === "baseline")!.assumptions.sipStep,
  ).toBe(500);
  expect(
    next.scenarios.find((s) => s.id === "step-up")!.assumptions.sipStep,
  ).toBe(1200);
  expect(
    Effect.runSync(Effect.either(transitionPlanningState(next, changed)))._tag,
  ).toBe("Left");
  expect(
    Effect.runSync(Effect.either(validatePlanningState(state, "other")))._tag,
  ).toBe("Left");
  expect(
    Effect.runSync(
      Effect.either(validatePlanningState({ ...state, model: "future" }, h.id)),
    )._tag,
  ).toBe("Left");
  expect(
    Effect.runSync(
      Effect.either(
        validatePlanningState({ ...state, budgets: { Food: -1 } }, h.id),
      ),
    )._tag,
  ).toBe("Left");
});
