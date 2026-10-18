/** Published price snapshots: standard short context, USD/M tokens, 18 October 2026. */
export const recipeModels = [
  {
    id: "sol",
    name: "Codex · GPT-6.1 Sol",
    input: 2,
    cached: 0.1,
    write: 2.5,
    output: 10,
    source: "https://developers.openai.com/api/docs/pricing",
  },
  {
    id: "opus",
    name: "Claude · Opus 5.5",
    input: 4,
    cached: 0.2,
    write: 5,
    output: 20,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
] as const;
export const salaryInr = {
  intern: 30000,
  developer: 100000,
  expert: 300000,
} as const;
type Pay = { [K in keyof typeof salaryInr]: number };
export type Crew = { interns: number; developers: number; experts: number };
export const compositions = [
  "Mostly interns",
  "Mixed talents",
  "Experienced / experts",
] as const;
export type Composition = (typeof compositions)[number];
/** Scenario capacity and effort conventions; these are not calibrated observations. */
export const recipeModules = [
  { id: "accounts", name: "Accounts & payments", low: 25, high: 50 },
  { id: "branch", name: "Customer + branch", low: 20, high: 40 },
  { id: "products", name: "Deposits & cards", low: 20, high: 40 },
  { id: "planning", name: "Household planning", low: 15, high: 30 },
  { id: "lending", name: "Personal lending", low: 35, high: 70 },
  { id: "agents", name: "AI & MCP channels", low: 30, high: 65 },
  { id: "reconciliation", name: "Ledger & reconciliation", low: 45, high: 100 },
  { id: "operations", name: "Security & operations", low: 40, high: 90 },
] as const;
export const scopeOptions = [
  {
    id: "journeys",
    name: "Working journeys on an existing core",
    factor: 2,
    controls: [0, 0],
  },
  {
    id: "pilot",
    name: "Bank pilot foundations on an existing core",
    factor: 3,
    controls: [200, 500],
  },
  {
    id: "fresh",
    name: "Independent core starter, written anew",
    factor: 6,
    controls: [600, 1500],
  },
] as const;
export type TeamInput = Crew & {
  composition: Composition;
  model: (typeof recipeModels)[number]["id"];
  reasoning: "low" | "medium";
  outputShare: number;
  cachedShare: number;
  cacheWriteShare: number;
  funding: "tokens" | "budget";
  dailyTokensM: number;
  budgetUsd: number;
  aiShare: number;
  draftSaving: number;
  review: number;
  coordination: number;
  overhead: number;
};
export type ComparisonInput = {
  weeks: number;
  daysPerWeek: number;
  complexity: number;
  scope: (typeof scopeOptions)[number]["id"];
  modules: readonly string[];
  pay: Pay;
};
export function crewFor(size: number, composition: Composition): Crew {
  const count = Math.max(0, Math.round(size));
  if (!count) return { interns: 0, developers: 0, experts: 0 };
  if (count === 1)
    return composition === "Mostly interns"
      ? { interns: 1, developers: 0, experts: 0 }
      : composition === "Mixed talents"
        ? { interns: 0, developers: 1, experts: 0 }
        : { interns: 0, developers: 0, experts: 1 };
  const experts = Math.min(
    count,
    Math.round(
      count *
        (composition === "Experienced / experts"
          ? 0.4
          : composition === "Mixed talents"
            ? 0.2
            : 0.1),
    ),
  );
  const developers = Math.min(
    count - experts,
    Math.max(
      count >= 3 ? 1 : 0,
      Math.round(
        count *
          (composition === "Mostly interns"
            ? 0.2
            : composition === "Mixed talents"
              ? 0.4
              : 0.5),
      ),
    ),
  );
  return { interns: count - experts - developers, developers, experts };
}
export const defaultComparison: ComparisonInput = {
  weeks: 10,
  daysPerWeek: 5,
  complexity: 1,
  scope: "journeys",
  modules: ["accounts", "branch", "reconciliation"],
  pay: { ...salaryInr },
};
export function defaultTeam(mode: "A" | "B"): TeamInput {
  return {
    ...crewFor(5, "Mixed talents"),
    composition: "Mixed talents",
    model: "sol",
    reasoning: mode === "A" ? "low" : "medium",
    outputShare: mode === "A" ? 0.1 : 0.2,
    cachedShare: 0,
    cacheWriteShare: 0,
    funding: "tokens",
    dailyTokensM: mode === "A" ? 0.02 : 2,
    budgetUsd: mode === "A" ? 100 : 5000,
    aiShare: mode === "A" ? 0.15 : 0.75,
    draftSaving: 0.35,
    review: 0.15,
    coordination: 0.15,
    overhead: 0,
  };
}
export function calculateTeam(team: TeamInput, input: ComparisonInput) {
  const model =
    recipeModels.find((r) => r.id === team.model) ?? recipeModels[0];
  const cached = Math.min(1, Math.max(0, team.cachedShare));
  const writes = Math.min(1 - cached, Math.max(0, team.cacheWriteShare));
  const blended =
    (1 - team.outputShare) *
      ((1 - cached - writes) * model.input +
        cached * model.cached +
        writes * model.write) +
    team.outputShare * model.output;
  const people = team.interns + team.developers + team.experts;
  const workingDays = input.weeks * input.daysPerWeek;
  const months = (input.weeks * 12) / 52;
  const monthlyPay =
    team.interns * input.pay.intern +
    team.developers * input.pay.developer +
    team.experts * input.pay.expert;
  const salary = monthlyPay * months;
  const overhead = salary * team.overhead;
  const tokensM =
    people === 0
      ? 0
      : team.funding === "budget"
        ? team.budgetUsd / blended
        : team.dailyTokensM * people * workingDays;
  const aiUsd = tokensM * blended;
  const rawDays = people * workingDays;
  const capacity =
    (team.interns * 0.35 + team.developers + team.experts * 1.3) *
    workingDays *
    (1 - team.coordination);
  const scope =
    scopeOptions.find((s) => s.id === input.scope) ?? scopeOptions[0];
  const selected = recipeModules.filter((m) => input.modules.includes(m.id));
  const draftFactor =
    1 - team.aiShare * team.draftSaving + team.aiShare * team.review;
  const modules = selected.map((m) => ({
    ...m,
    low: m.low * scope.factor * input.complexity * draftFactor,
    high: m.high * scope.factor * input.complexity * draftFactor,
  }));
  // Controls remain human work. They also require expert capacity; AI never reduces them.
  const controlsLow = selected.length ? scope.controls[0] : 0,
    controlsHigh = selected.length ? scope.controls[1] : 0;
  // An expert control-day occupies the expert's full 1.3-reference-day slot.
  // Charging only one reference day would leave fictitious drafting capacity.
  const controlReferenceLow = controlsLow * 1.3;
  const controlReferenceHigh = controlsHigh * 1.3;
  const low = modules.reduce((sum, m) => sum + m.low, 0) + controlReferenceLow;
  const high =
    modules.reduce((sum, m) => sum + m.high, 0) + controlReferenceHigh;
  const expertCapacity = team.experts * workingDays * (1 - team.coordination);
  const aiBudgetMissing = people > 0 && team.aiShare > 0 && tokensM <= 0;
  const valid =
    people > 0 && capacity > 0 && selected.length > 0 && !aiBudgetMissing;
  const expertBlocked = controlsHigh > 0 && team.experts === 0;
  const lowWeeks =
    valid && !expertBlocked
      ? Math.max(
          low / capacity,
          controlsLow > 0 ? controlsLow / expertCapacity : 0,
        ) * input.weeks
      : null;
  const highWeeks =
    valid && !expertBlocked
      ? Math.max(
          high / capacity,
          controlsHigh > 0 ? controlsHigh / expertCapacity : 0,
        ) * input.weeks
      : null;
  let cumulativeLow = controlReferenceLow,
    cumulativeHigh = controlReferenceHigh;
  const milestones = modules.map((module) => {
    cumulativeLow += module.low;
    cumulativeHigh += module.high;
    const cautious =
      valid &&
      !expertBlocked &&
      cumulativeHigh <= capacity &&
      controlsHigh <= expertCapacity;
    const optimistic =
      valid &&
      !expertBlocked &&
      cumulativeLow <= capacity &&
      controlsLow <= expertCapacity;
    return {
      ...module,
      cumulativeLow,
      cumulativeHigh,
      status: !valid
        ? "Complete the assumptions"
        : cautious
          ? "Within both bounds"
          : optimistic
            ? "Optimistic bound only"
            : "Beyond this window",
    };
  });
  const fit = aiBudgetMissing
    ? "Add AI usage or set AI drafting assistance to 0"
    : !valid
      ? "Choose people and capabilities"
      : expertBlocked
        ? "Expert capacity required"
        : highWeeks !== null && highWeeks <= input.weeks
          ? "Within both modelled bounds"
          : lowWeeks !== null && lowWeeks <= input.weeks
            ? "Fits the optimistic bound"
            : "More time or a narrower scope";
  const completionBudget =
    lowWeeks === null || highWeeks === null
      ? null
      : {
          peopleLow: (salary * (1 + team.overhead) * lowWeeks) / input.weeks,
          peopleHigh: (salary * (1 + team.overhead) * highWeeks) / input.weeks,
          aiLow: (aiUsd * lowWeeks) / input.weeks,
          aiHigh: (aiUsd * highWeeks) / input.weeks,
        };
  return {
    completionBudget,
    people,
    workingDays,
    months,
    monthlyPay,
    salary,
    overhead,
    peopleInr: salary + overhead,
    tokensM,
    aiUsd,
    blended,
    rawDays,
    capacity,
    modules,
    milestones,
    low,
    high,
    controlsLow,
    controlsHigh,
    expertCapacity,
    lowWeeks,
    highWeeks,
    fit,
    valid,
    expertBlocked,
  };
}
export type HistoryInput = {
  years: number;
  engineers: number;
  monthlyPay: number;
  overhead: number;
  daysPerYear: number;
  sensitivity: number;
};
export const defaultHistory: HistoryInput = {
  years: 26,
  engineers: 400,
  monthlyPay: 70000,
  overhead: 0.5,
  daysPerYear: 220,
  sensitivity: 0.4,
};
export function calculateHistory(input: HistoryInput) {
  const personDays = input.years * input.engineers * input.daysPerYear;
  const salary = input.years * 12 * input.engineers * input.monthlyPay;
  const overhead = salary * input.overhead;
  return {
    personDays,
    personYears: input.years * input.engineers,
    salary,
    overhead,
    total: salary + overhead,
    low: (salary + overhead) * (1 - input.sensitivity),
    high: (salary + overhead) * (1 + input.sensitivity),
  };
}
export const historicalSources = {
  launch:
    "https://www.infosys.com/newsroom/press-releases/documents/2000/finacle-05july00.pdf",
  version10:
    "https://www.finacle.com/news-room/press-release/finacle-infosys-unveils-finacle-10-next-generation-solution-banking-transformation/",
  case: "https://mba.tuck.dartmouth.edu/pages/faculty/chris.trimble/research/Case_Downloads/DisciplinedInnovation/20025-Infosys_Finacle_11.2007.pdf",
} as const;
export function impactScenario(
  result: ReturnType<typeof calculateTeam>,
  benefit: number,
  running: number,
  fx: number | null,
) {
  if (
    !result.valid ||
    result.highWeeks === null ||
    !fx ||
    fx <= 0 ||
    benefit <= 0
  )
    return null;
  const upfront = result.peopleInr + result.aiUsd * fx,
    net = benefit - running;
  if (upfront <= 0) return null;
  return {
    upfront,
    roi: ((net * 12 - upfront) / upfront) * 100,
    payback: net > 0 ? upfront / net : null,
  };
}
