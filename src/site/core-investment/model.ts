import {
  calculateTeam,
  defaultComparison,
  defaultTeam,
} from "../../../app/build-recipe-model";

/** 2008 release-wide lower-bound anchors; allocation to core is a planning inference. */
export const finacleCore = {
  publishedUsd: 60000000,
  publishedDays: 240000,
  years: 3,
  daysPerYear: 220,
  share: 0.5,
  shareLow: 0.35,
  shareHigh: 0.7,
  source:
    "https://www.finacle.com/news-room/press-release/finacle-infosys-unveils-finacle-10-next-generation-solution-banking-transformation/",
} as const;

export type CorePlan = {
  people: number;
  weeks: number;
  codex: number;
  claude: number;
  monthlyApiUsd: number;
  monthlyPayInr: number;
};
export const defaultCorePlan: CorePlan = {
  people: 5,
  weeks: 10,
  codex: 3,
  claude: 1,
  monthlyApiUsd: 0,
  monthlyPayInr: 100000,
};

export function coreInvestment(plan: CorePlan) {
  const months = (plan.weeks * 12) / 52;
  const billingMonths = Math.ceil(months - 1e-9);
  const monthlySubscriptions = (plan.codex + plan.claude) * 200;
  const toolUsd =
    billingMonths * monthlySubscriptions + months * plan.monthlyApiUsd;
  const payrollInr = plan.people * plan.monthlyPayInr * months;
  // Preserve canonical effort/capacity arithmetic, independently of purchased accounts.
  // One banking expert + remaining experienced developers; everyone works full-time.
  const team = {
    ...defaultTeam("B"),
    interns: 0,
    developers: Math.max(0, plan.people - 1),
    experts: plan.people > 0 ? 1 : 0,
    aiShare: plan.codex + plan.claude > 0 || plan.monthlyApiUsd > 0 ? 0.75 : 0,
    // Positive activity marker enables canonical AI assumptions; subscription
    // dollars are never passed off as API credits. Ignore its token/cost outputs.
    funding: "tokens" as const,
    dailyTokensM:
      plan.codex + plan.claude > 0 || plan.monthlyApiUsd > 0 ? 1 : 0,
    budgetUsd: 0,
    overhead: 0,
  };
  const effort = calculateTeam(team, {
    ...defaultComparison,
    weeks: plan.weeks,
    scope: "journeys",
    modules: [
      "accounts",
      "branch",
      "products",
      "reconciliation",
      "lending",
      "operations",
    ],
    pay: {
      intern: plan.monthlyPayInr,
      developer: plan.monthlyPayInr,
      expert: plan.monthlyPayInr,
    },
  });
  return {
    months,
    billingMonths,
    monthlySubscriptions,
    monthlyTools: monthlySubscriptions + plan.monthlyApiUsd,
    toolUsd,
    payrollInr,
    personDays: plan.people * plan.weeks * 5,
    hours: plan.people * plan.weeks * 40,
    lowWeeks: effort.lowWeeks,
    highWeeks: effort.highWeeks,
    referenceDaysLow: effort.low,
    referenceDaysHigh: effort.high,
    // These are inferred equivalents, not disclosed headcounts or audited totals.
    finacleUsd: finacleCore.publishedUsd * finacleCore.share,
    finacleDays: finacleCore.publishedDays * finacleCore.share,
    finaclePeople:
      (finacleCore.publishedDays * finacleCore.share) /
      (finacleCore.years * finacleCore.daysPerYear),
  };
}
export type CoreInvestment = ReturnType<typeof coreInvestment>;
export const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
export const inr = (value: number) => `₹${formatNumber(value)}`;
export const usd = (value: number) =>
  `US$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
export const durationRange = (result: CoreInvestment) =>
  result.lowWeeks === null || result.highWeeks === null
    ? "No team selected"
    : `${Math.ceil(result.lowWeeks)}–${Math.ceil(result.highWeeks)} weeks`;

export const formatWeeks = (weeks: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(weeks);
