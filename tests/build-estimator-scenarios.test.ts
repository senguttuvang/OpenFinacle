import { describe, expect, test } from "bun:test";
import {
  comparisonFor,
  estimatorScenarios,
} from "../src/site/build-estimator/scenarios";
import {
  calculateTeam,
  defaultTeam,
} from "../src/site/build-story/build-recipe-model";

describe("estimator scope contract", () => {
  test("prototype uses the same explicit application slice for either team", () => {
    const input = comparisonFor(estimatorScenarios[0], 10);
    expect(input.modules).toEqual(["accounts", "branch", "products"]);
    expect(input.scope).toBe("journeys");
    const same = defaultTeam("A");
    expect(calculateTeam(same, input).capacity).toBe(170);
    expect(calculateTeam(same, input).controlsHigh).toBe(0);
  });
  test("pilot adds expert controls that tokens cannot remove", () => {
    const input = comparisonFor(estimatorScenarios[1], 10);
    const noExperts = {
      ...defaultTeam("B"),
      interns: 0,
      developers: 5,
      experts: 0,
      dailyTokensM: 400,
    };
    const result = calculateTeam(noExperts, input);
    expect(result.controlsLow).toBe(200);
    expect(result.controlsHigh).toBe(500);
    expect(result.expertBlocked).toBe(true);
    expect(result.highWeeks).toBeNull();
    expect(result.completionBudget).toBeNull();
  });
  test("a production program never borrows a pilot estimate", () => {
    const scenario = estimatorScenarios[2];
    expect(scenario.estimable).toBe(false);
    const result = calculateTeam(defaultTeam("B"), comparisonFor(scenario, 10));
    expect(result.valid).toBe(false);
    expect(result.lowWeeks).toBeNull();
    expect(result.completionBudget).toBeNull();
  });
  test("100 billion tokens affects spending, never delivery effort", () => {
    const input = comparisonFor(estimatorScenarios[0], 10);
    const ordinary = calculateTeam(defaultTeam("B"), input);
    const large = calculateTeam(
      { ...defaultTeam("B"), dailyTokensM: 400 },
      input,
    );
    expect(large.tokensM).toBe(100000);
    expect(large.aiUsd).toBeCloseTo(360000);
    expect(large.highWeeks).toBe(ordinary.highWeeks);
    expect(large.high).toBe(ordinary.high);
  });
});
