import { describe, expect, test } from "bun:test";
import { calculateRecipe, type RecipeInput } from "../app/build-recipe-model";

const input: RecipeInput = {
  interns: 2,
  developers: 2,
  experts: 1,
  months: 3,
  approach: "assisted",
  scope: "rebuild",
  modules: ["accounts", "branch", "planning"],
  model: "sol",
  reasoning: "medium",
  cachedShare: 0.5,
  funding: "tokens",
  tokensB: 1,
  budgetUsd: 5000,
  aiTaskShare: 0.4,
  draftSaving: 0.2,
  coordination: 0.15,
  overhead: 0,
  monthlyBenefitInr: 0,
  monthlyRunningInr: 0,
  fxInrPerUsd: null,
};
describe("build recipe separates money, resource assumptions and accepted output", () => {
  test("uses supplied talent pay, selected months and explicit overhead", () => {
    const r = calculateRecipe(input);
    expect(r.monthlyPayInr).toBe(560000);
    expect(r.payrollInr).toBe(1680000);
    expect(r.people).toBe(5);
    expect(calculateRecipe({ ...input, overhead: 0.25 }).payrollInr).toBe(
      2100000,
    );
  });
  test("models all four requested API/reasoning choices without price-to-productivity conversion", () => {
    const expected = {
      sol: { low: 1945, medium: 2840 },
      opus: { low: 3890, medium: 5680 },
    };
    for (const model of ["sol", "opus"] as const)
      for (const reasoning of ["low", "medium"] as const) {
        const r = calculateRecipe({ ...input, model, reasoning });
        expect(r.aiUsd).toBeCloseTo(expected[model][reasoning], 8);
        expect(r.lowMonths).toBe(calculateRecipe(input).lowMonths);
        expect(r.highMonths).toBe(calculateRecipe(input).highMonths);
      }
  });
  test("budget and token modes invert the same rate; more tokens buy no delivery capacity", () => {
    const r = calculateRecipe({
      ...input,
      funding: "budget",
      budgetUsd: 5680,
      model: "opus",
    });
    expect(r.tokensB).toBeCloseTo(1, 10);
    expect(r.aiUsd).toBeCloseTo(5680, 8);
    const more = calculateRecipe({ ...input, tokensB: 100 });
    expect(more.aiUsd).toBeCloseTo(284000, 6);
    expect(more.lowMonths).toBe(calculateRecipe(input).lowMonths);
  });
  test("unknown benefit and absent FX never imply ROI or an implicit currency conversion", () => {
    const r = calculateRecipe({ ...input, monthlyBenefitInr: 500000 });
    expect(r.totalInr).toBeNull();
    expect(r.roi).toBeNull();
    expect(r.paybackMonths).toBeNull();
    expect(calculateRecipe({ ...input, fxInrPerUsd: 85 }).roi).toBeNull();
  });
  test("explicit FX combines the whole-plan API allowance once with payroll", () => {
    const r = calculateRecipe({
      ...input,
      monthlyBenefitInr: 500000,
      monthlyRunningInr: 100000,
      fxInrPerUsd: 85,
    });
    expect(r.totalInr).toBeCloseTo(1921400, 6);
    expect(r.roi).toBeCloseTo(((4800000 - 1921400) / 1921400) * 100, 8);
    expect(r.paybackMonths).toBeCloseTo(1921400 / 400000, 8);
  });
  test("negative net benefit has negative ROI and no positive payback", () => {
    const r = calculateRecipe({
      ...input,
      monthlyBenefitInr: 100000,
      monthlyRunningInr: 200000,
      fxInrPerUsd: 85,
    });
    expect(r.roi).toBeLessThan(-100);
    expect(r.paybackMonths).toBeNull();
  });
  test("no people, no selected modules or a broad core never produces a delivery claim", () => {
    for (const patch of [
      { interns: 0, developers: 0, experts: 0 },
      { modules: [] },
      { scope: "core" as const },
    ]) {
      const r = calculateRecipe({ ...input, ...patch });
      expect(r.estimable).toBe(false);
      expect(r.lowMonths).toBeNull();
      expect(r.highMonths).toBeNull();
    }
  });
  test("AI task allocation carries review cost; zero savings can increase effort", () => {
    const manual = calculateRecipe({ ...input, aiTaskShare: 0 });
    const noSaving = calculateRecipe({
      ...input,
      approach: "native",
      aiTaskShare: 0.75,
      draftSaving: 0,
    });
    expect(noSaving.low).toBeGreaterThan(manual.low);
    expect(noSaving.high).toBeGreaterThan(manual.high);
  });
  test("larger selected scope and production controls add modelled work", () => {
    const small = calculateRecipe(input);
    const large = calculateRecipe({
      ...input,
      modules: [...input.modules, "lending"],
    });
    const prod = calculateRecipe({ ...input, scope: "production" });
    expect(large.low).toBeGreaterThan(small.low);
    expect(prod.low).toBeGreaterThan(large.low);
    expect(prod.high).toBeGreaterThan(prod.low);
  });
});

test("AI drafting assumptions never shrink the separate production-control allowance", () => {
  const r = calculateRecipe({
    ...input,
    scope: "production",
    modules: [],
    aiTaskShare: 0.9,
    draftSaving: 0.4,
  });
  expect(r.low).toBe(200);
  expect(r.high).toBe(500);
});
test("unestimated scopes cannot acquire an ROI claim from an entered benefit", () => {
  for (const patch of [
    { scope: "core" as const },
    { interns: 0, developers: 0, experts: 0 },
    { modules: [] },
  ]) {
    const r = calculateRecipe({
      ...input,
      ...patch,
      monthlyBenefitInr: 500000,
      fxInrPerUsd: 85,
    });
    expect(r.roi).toBeNull();
    expect(r.paybackMonths).toBeNull();
  }
});
