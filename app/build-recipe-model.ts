/** User-provided monthly INR pay assumptions; API snapshots retrieved 18 Oct 2026. */
export const salaryInr = {
  intern: 30000,
  developer: 100000,
  expert: 300000,
} as const;
export const recipeModels = [
  {
    id: "sol",
    name: "Codex · GPT-6.1 Sol",
    input: 2,
    cached: 0.1,
    output: 10,
    source: "https://developers.openai.com/api/docs/pricing",
  },
  {
    id: "opus",
    name: "Claude · Opus 5.5",
    input: 4,
    cached: 0.2,
    output: 20,
    source: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
] as const;
/** Editable scenario conventions, not observed model reasoning consumption. */
export const reasoningMix = {
  low: { label: "Low", outputShare: 0.1 },
  medium: { label: "Medium", outputShare: 0.2 },
} as const;
/** Uncalibrated planning ranges for comparable selected journeys on an existing core. */
export const recipeModules = [
  { id: "accounts", name: "Accounts & payments", low: 25, high: 50 },
  { id: "branch", name: "Customer + branch", low: 20, high: 40 },
  { id: "products", name: "Deposits & cards", low: 20, high: 40 },
  { id: "planning", name: "Household planning", low: 15, high: 30 },
  { id: "lending", name: "Personal lending", low: 35, high: 70 },
  { id: "agents", name: "AI & MCP channels", low: 30, high: 65 },
] as const;
export type RecipeInput = {
  interns: number;
  developers: number;
  experts: number;
  months: number;
  approach: "assisted" | "native";
  scope: "extend" | "rebuild" | "production" | "core";
  modules: string[];
  model: (typeof recipeModels)[number]["id"];
  reasoning: keyof typeof reasoningMix;
  cachedShare: number;
  funding: "tokens" | "budget";
  tokensB: number;
  budgetUsd: number;
  aiTaskShare: number;
  draftSaving: number;
  coordination: number;
  overhead: number;
  monthlyBenefitInr: number;
  monthlyRunningInr: number;
  fxInrPerUsd: number | null;
};
export function calculateRecipe(input: RecipeInput) {
  const model =
    recipeModels.find((item) => item.id === input.model) ?? recipeModels[0];
  const outputShare = reasoningMix[input.reasoning].outputShare;
  const blendedPerMillion =
    (1 - outputShare) *
      ((1 - input.cachedShare) * model.input +
        input.cachedShare * model.cached) +
    outputShare * model.output;
  const tokenMillions =
    input.funding === "tokens"
      ? input.tokensB * 1000
      : input.budgetUsd / blendedPerMillion;
  const aiUsd = tokenMillions * blendedPerMillion;
  const people = input.interns + input.developers + input.experts;
  const monthlyPayInr =
    input.interns * salaryInr.intern +
    input.developers * salaryInr.developer +
    input.experts * salaryInr.expert;
  const monthlyTeamInr = monthlyPayInr * (1 + input.overhead);
  const payrollInr = monthlyTeamInr * input.months;
  // Explicit hypotheses: intern 0.35, developer 1, expert 1.3 reference days/day.
  const referenceDaysPerMonth =
    (input.interns * 0.35 + input.developers + input.experts * 1.3) *
    20 *
    (1 - input.coordination);
  const selected = recipeModules.filter((item) =>
    input.modules.includes(item.id),
  );
  // Savings affect only the chosen AI-assisted drafting share. A 10% review
  // allowance on that share offsets it. Neither price nor reasoning adds capacity.
  const draftFactor =
    1 - input.aiTaskShare * input.draftSaving + input.aiTaskShare * 0.1;
  const multiplier =
    input.scope === "extend" ? 0.6 : input.scope === "rebuild" ? 2 : 3;
  const low =
    selected.reduce((sum, item) => sum + item.low, 0) *
      multiplier *
      draftFactor +
    (input.scope === "production" ? 200 : 0);
  const high =
    selected.reduce((sum, item) => sum + item.high, 0) *
      multiplier *
      draftFactor +
    (input.scope === "production" ? 500 : 0);
  const estimable =
    input.scope !== "core" && selected.length > 0 && referenceDaysPerMonth > 0;
  const lowMonths = estimable ? low / referenceDaysPerMonth : null;
  const highMonths = estimable ? high / referenceDaysPerMonth : null;
  const capacity = referenceDaysPerMonth * input.months;
  const fx = input.fxInrPerUsd;
  const totalInr = fx !== null && fx > 0 ? payrollInr + aiUsd * fx : null;
  const netBenefitInr = input.monthlyBenefitInr - input.monthlyRunningInr;
  const roi =
    estimable &&
    totalInr !== null &&
    totalInr > 0 &&
    input.monthlyBenefitInr > 0
      ? ((netBenefitInr * 12 - totalInr) / totalInr) * 100
      : null;
  const paybackMonths =
    estimable && totalInr !== null && netBenefitInr > 0
      ? totalInr / netBenefitInr
      : null;
  return {
    model,
    blendedPerMillion,
    tokensB: tokenMillions / 1000,
    aiUsd,
    people,
    monthlyPayInr,
    monthlyTeamInr,
    payrollInr,
    referenceDaysPerMonth,
    capacity,
    selected,
    estimable,
    low,
    high,
    lowMonths,
    highMonths,
    totalInr,
    roi,
    paybackMonths,
  };
}
