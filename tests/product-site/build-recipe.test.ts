import { expect, test } from "bun:test";
import {
  calculateHistory,
  calculateTeam,
  compositions,
  crewFor,
  defaultComparison,
  defaultHistory,
  defaultTeam,
  impactScenario,
} from "../../src/site/build-story/build-recipe-model";

test("ten-week salary uses the supplied monthly pay scales and calendar window", () => {
  const r = calculateTeam(defaultTeam("A"), defaultComparison);
  expect(r.monthlyPay).toBe(560000);
  expect(r.months).toBeCloseTo(120 / 52);
  expect(r.salary).toBeCloseTo((560000 * 120) / 52);
  expect(
    calculateTeam({ ...defaultTeam("A"), overhead: 0.25 }, defaultComparison)
      .peopleInr,
  ).toBeCloseTo(r.salary * 1.25);
});
test("three compositions preserve headcount, never create negative members and genuinely change the mix", () => {
  for (const size of [0, 1, 2, 5, 10, 30])
    for (const c of compositions) {
      const crew = crewFor(size, c);
      expect(crew.interns + crew.developers + crew.experts).toBe(size);
      expect(Math.min(...Object.values(crew))).toBeGreaterThanOrEqual(0);
    }
  expect(crewFor(5, "Mostly interns")).toEqual({
    interns: 3,
    developers: 1,
    experts: 1,
  });
  expect(crewFor(5, "Mixed talents")).toEqual({
    interns: 2,
    developers: 2,
    experts: 1,
  });
  expect(crewFor(5, "Experienced / experts")).toEqual({
    interns: 0,
    developers: 3,
    experts: 2,
  });
});
test("daily token usage and all four model/reasoning prices use explicit mixes", () => {
  const a = calculateTeam(defaultTeam("A"), defaultComparison),
    b = calculateTeam(defaultTeam("B"), defaultComparison);
  expect(a.tokensM).toBe(5);
  expect(a.aiUsd).toBeCloseTo(14);
  expect(b.tokensM).toBe(500);
  expect(b.aiUsd).toBeCloseTo(1800);
  for (const [model, outputShare, expected] of [
    ["sol", 0.1, 2.8],
    ["sol", 0.2, 3.6],
    ["opus", 0.1, 5.6],
    ["opus", 0.2, 7.2],
  ] as const)
    expect(
      calculateTeam(
        { ...defaultTeam("B"), model, outputShare },
        defaultComparison,
      ).blended,
    ).toBeCloseTo(expected);
});
test("cache writes and hits are billed as mutually exclusive input categories", () => {
  const r = calculateTeam(
    { ...defaultTeam("B"), cachedShare: 0.5, cacheWriteShare: 0.1 },
    defaultComparison,
  );
  expect(r.blended).toBeCloseTo(
    0.8 * (0.4 * 2 + 0.5 * 0.1 + 0.1 * 2.5) + 0.2 * 10,
  );
  const clamped = calculateTeam(
    { ...defaultTeam("B"), cachedShare: 0.9, cacheWriteShare: 0.9 },
    defaultComparison,
  );
  expect(clamped.blended).toBeCloseTo(0.8 * (0.9 * 0.1 + 0.1 * 2.5) + 0.2 * 10);
});
test("USD budget inversely calculates usage and never implies an INR conversion", () => {
  const r = calculateTeam(
    { ...defaultTeam("B"), funding: "budget", budgetUsd: 3600 },
    defaultComparison,
  );
  expect(r.aiUsd).toBeCloseTo(3600);
  expect(r.tokensM).toBeCloseTo(1000);
  expect(r.peopleInr).toBeCloseTo(
    calculateTeam(defaultTeam("B"), defaultComparison).peopleInr,
  );
});
test("price, reasoning label and token envelope do not create delivery capacity", () => {
  const base = calculateTeam(defaultTeam("B"), defaultComparison);
  for (const patch of [
    { model: "opus" as const },
    { dailyTokensM: 100 },
    { reasoning: "low" as const },
    { budgetUsd: 100000, funding: "budget" as const },
  ]) {
    const r = calculateTeam(
      { ...defaultTeam("B"), ...patch },
      defaultComparison,
    );
    expect(r.capacity).toBe(base.capacity);
    expect(r.lowWeeks).toBe(base.lowWeeks);
    expect(r.highWeeks).toBe(base.highWeeks);
  }
});
test("AI-first can be slower when review outweighs assumed savings; no winner is hard-coded", () => {
  const common = { draftSaving: 0, review: 0.2 };
  const a = calculateTeam(
      { ...defaultTeam("A"), ...common },
      defaultComparison,
    ),
    b = calculateTeam({ ...defaultTeam("B"), ...common }, defaultComparison);
  expect(b.lowWeeks ?? 0).toBeGreaterThan(a.lowWeeks ?? 0);
  const same = calculateTeam(
    { ...defaultTeam("A"), aiShare: 0.75 },
    defaultComparison,
  );
  expect(same.lowWeeks).toBe(
    calculateTeam(defaultTeam("B"), defaultComparison).lowWeeks,
  );
});
test("human control effort is never reduced by AI and expert capacity constrains elapsed time", () => {
  const input = { ...defaultComparison, scope: "pilot" as const };
  const a = calculateTeam(
    { ...defaultTeam("A"), aiShare: 1, draftSaving: 0.8, review: 0 },
    input,
  );
  expect(a.controlsLow).toBe(200);
  expect(a.controlsHigh).toBe(500);
  expect(a.lowWeeks).toBeGreaterThanOrEqual((200 / (50 * 0.85)) * 10);
  const blocked = calculateTeam({ ...defaultTeam("A"), experts: 0 }, input);
  expect(blocked.expertBlocked).toBe(true);
  expect(blocked.highWeeks).toBeNull();
  expect(impactScenario(blocked, 500000, 100000, 85)).toBeNull();
});
test("empty crews or capabilities cannot produce delivery/ROI promises", () => {
  for (const [team, input] of [
    [
      { ...defaultTeam("A"), interns: 0, developers: 0, experts: 0 },
      defaultComparison,
    ],
    [defaultTeam("A"), { ...defaultComparison, modules: [] }],
  ] as const) {
    const r = calculateTeam(team, input);
    expect(r.highWeeks).toBeNull();
    expect(r.milestones).toHaveLength(input.modules.length ? 3 : 0);
    expect(impactScenario(r, 10000, 0, 85)).toBeNull();
  }
});
test("capability sequence reserves controls and distinguishes lower-bound from cautious fits", () => {
  const r = calculateTeam(defaultTeam("A"), defaultComparison);
  expect(r.milestones[0]?.status).toBe("Within both bounds");
  expect(r.milestones[1]?.status).toBe("Optimistic bound only");
  expect(r.milestones[2]?.status).toBe("Beyond this window");
  const pilot = calculateTeam(defaultTeam("B"), {
    ...defaultComparison,
    scope: "pilot",
  });
  expect(pilot.milestones.every((m) => m.status === "Beyond this window")).toBe(
    true,
  );
});
test("lifetime history is explicit payroll arithmetic with sensitivity, not a published cumulative total", () => {
  const r = calculateHistory(defaultHistory);
  expect(r.personDays).toBe(26 * 400 * 220);
  expect(r.salary).toBe(26 * 12 * 400 * 70000);
  expect(r.overhead).toBe(r.salary * 0.5);
  expect(r.total).toBe(r.salary * 1.5);
  expect(r.low).toBeCloseTo(r.total * 0.6);
  expect(r.high).toBeCloseTo(r.total * 1.4);
});
test("impact requires explicit benefit/FX and uses the selected-window budgets only once", () => {
  const r = calculateTeam(defaultTeam("B"), defaultComparison);
  expect(impactScenario(r, 500000, 100000, null)).toBeNull();
  expect(impactScenario(r, 0, 100000, 85)).toBeNull();
  const impact = impactScenario(r, 500000, 100000, 85);
  expect(impact?.upfront).toBeCloseTo(r.peopleInr + r.aiUsd * 85);
  expect(impact?.roi).toBeCloseTo(
    (4800000 / (r.peopleInr + r.aiUsd * 85) - 1) * 100,
  );
  expect(impactScenario(r, 10000, 20000, 85)?.payback).toBeNull();
});

test("completion budgets follow the whole estimated range at the same weekly run rate", () => {
  const r = calculateTeam(defaultTeam("A"), defaultComparison);
  expect(r.completionBudget?.peopleLow).toBeCloseTo(
    (r.peopleInr * (r.lowWeeks ?? 0)) / 10,
  );
  expect(r.completionBudget?.peopleHigh).toBeCloseTo(
    (r.peopleInr * (r.highWeeks ?? 0)) / 10,
  );
  expect(r.completionBudget?.aiHigh).toBeCloseTo(
    (r.aiUsd * (r.highWeeks ?? 0)) / 10,
  );
  expect(
    calculateTeam(defaultTeam("A"), { ...defaultComparison, modules: [] })
      .completionBudget,
  ).toBeNull();
});

test("shared complexity scales module work for both teams while preserving human control allowances", () => {
  const base = { ...defaultComparison, scope: "pilot" as const };
  for (const mode of ["A", "B"] as const) {
    const one = calculateTeam(defaultTeam(mode), base),
      two = calculateTeam(defaultTeam(mode), { ...base, complexity: 2 });
    expect(two.low - two.controlsLow * 1.3).toBeCloseTo(
      (one.low - one.controlsLow * 1.3) * 2,
    );
    expect(two.controlsHigh).toBe(one.controlsHigh);
    expect(two.peopleInr).toBe(one.peopleInr);
  }
});

test("expert controls consume the full expert slot, leaving no free drafting capacity", () => {
  const team = { ...defaultTeam("A"), interns: 0, developers: 0, experts: 1 };
  const input = { ...defaultComparison, scope: "pilot" as const };
  const r = calculateTeam(team, input);
  const moduleLow = r.modules.reduce((sum, m) => sum + m.low, 0);
  const expectedWorkingDays = r.controlsLow + moduleLow / 1.3;
  expect(r.lowWeeks).toBeCloseTo(
    expectedWorkingDays / (input.daysPerWeek * (1 - team.coordination)),
  );
});

test("tiny mostly-intern crews never silently become paid experts", () => {
  expect(crewFor(1, "Mostly interns")).toEqual({
    interns: 1,
    developers: 0,
    experts: 0,
  });
  expect(crewFor(2, "Mostly interns")).toEqual({
    interns: 2,
    developers: 0,
    experts: 0,
  });
  expect(crewFor(1, "Mixed talents")).toEqual({
    interns: 0,
    developers: 1,
    experts: 0,
  });
  expect(crewFor(1, "Experienced / experts")).toEqual({
    interns: 0,
    developers: 0,
    experts: 1,
  });
});
test("zero API allowance cannot grant free assumed AI productivity", () => {
  for (const patch of [
    { dailyTokensM: 0 },
    { funding: "budget" as const, budgetUsd: 0 },
  ]) {
    const r = calculateTeam(
      { ...defaultTeam("B"), ...patch },
      defaultComparison,
    );
    expect(r.highWeeks).toBeNull();
    expect(r.completionBudget).toBeNull();
    expect(r.fit).toContain("Add AI usage");
    expect(impactScenario(r, 500000, 0, 85)).toBeNull();
  }
  expect(
    calculateTeam(
      { ...defaultTeam("B"), dailyTokensM: 0, aiShare: 0 },
      defaultComparison,
    ).highWeeks,
  ).not.toBeNull();
});
