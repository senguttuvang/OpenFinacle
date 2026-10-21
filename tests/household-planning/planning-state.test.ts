import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { planningHouseholds } from "../../src/demo/households/planning-fixtures";
import {
  initialPlanningState,
  PlanningError,
  PlanningScenario,
  transitionPlanningState,
  validatePlanningState,
} from "../../src/platform/household-planning/domain/planning-state";

const h = planningHouseholds()[0]!;
test("state rejects household leaks, invalid versions and assumptions, preserves independent snapshots", () => {
  const state = initialPlanningState(h);
  const alreadyRetired = {
    ...state,
    scenarios: state.scenarios.map((s) => ({
      ...s,
      assumptions: { ...s.assumptions, age: 65, retireAge: 60 },
    })),
  };
  expect(
    Effect.runSync(Effect.either(validatePlanningState(alreadyRetired, h.id)))
      ._tag,
  ).toBe("Right");
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
    Schema.decodeUnknownEither(PlanningScenario)({
      ...state.scenarios[0],
      name: "",
    })._tag,
  ).toBe("Left");
  const conflict = Effect.runSync(
    Effect.flip(transitionPlanningState(next, changed)),
  );
  expect(conflict).toBeInstanceOf(PlanningError);
  expect(conflict.status).toBe(409);
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
