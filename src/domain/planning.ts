import { Effect, Schema } from "effect";

export const planningAnchor = "2026-10-17";
export const planningModel = "india-household-v1";
const Minor = Schema.Number.pipe(Schema.int(), Schema.between(0, 900000000000));
const Rate = Schema.Number.pipe(Schema.int(), Schema.between(0, 2000));
export const PlanningAssumptions = Schema.Struct({
  age: Schema.Number.pipe(Schema.int(), Schema.between(25, 85)),
  retireAge: Schema.Number.pipe(Schema.int(), Schema.between(25, 85)),
  longevity: Schema.Number.pipe(Schema.int(), Schema.between(60, 100)),
  income: Minor,
  essential: Minor,
  discretionary: Minor,
  pension: Minor,
  dependent: Minor,
  dependentYears: Schema.Number.pipe(Schema.int(), Schema.between(0, 50)),
  essentialInflation: Rate,
  discretionaryInflation: Rate,
  incomeGrowth: Rate,
  returnRate: Rate,
  fee: Schema.Number.pipe(Schema.int(), Schema.between(0, 500)),
  sip: Minor,
  sipStep: Rate,
  prepayment: Minor,
  education: Minor,
  educationYear: Schema.Number.pipe(Schema.int(), Schema.between(2026, 2100)),
  breakYear: Schema.Number.pipe(Schema.int(), Schema.between(2026, 2100)),
  breakMonths: Schema.Number.pipe(Schema.int(), Schema.between(0, 24)),
  medicalShock: Minor,
  rentChange: Minor,
  adverseSequence: Schema.Boolean,
});
export type PlanningAssumptions = typeof PlanningAssumptions.Type;
export type PlanningPosting = {
  id: string;
  date: string;
  account: string;
  member: string;
  merchant: string;
  category: string;
  minor: number;
  kind:
    | "income"
    | "expense"
    | "refund"
    | "reimbursement"
    | "transfer"
    | "investment"
    | "principal"
    | "interest";
  link: string | null;
};
type PlanningAccount = {
  id: string;
  label: string;
  owners: string;
  opening: number;
};
type PlanningHolding = {
  id: string;
  name: string;
  category: string;
  owner: string;
  minor: number;
  liquidity: "liquid" | "investable" | "locked" | "home";
  source: string;
  asOf: string;
  units: string;
  cost: number;
};
export type PlanningDebt = { principal: number; rate: number; emi: number };
export type PlanningHousehold = {
  id: string;
  name: string;
  city: string;
  description: string;
  members: readonly string[];
  accounts: PlanningAccount[];
  postings: PlanningPosting[];
  holdings: PlanningHolding[];
  debt: PlanningDebt;
  assumptions: PlanningAssumptions;
};
export type PlanningFilter = {
  from: string;
  to: string;
  account: string;
  member: string;
  category: string;
  merchant: string;
};
export const planningMoney = (minor: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minor / 100);
export const planningDay = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const planningRange = (
  preset: string,
  anchor = planningAnchor,
): { from: string; to: string } => {
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  const fy = month >= 4 ? year : year - 1;
  if (preset === "30" || preset === "90")
    return { from: planningDay(anchor, 1 - Number(preset)), to: anchor };
  if (preset === "month")
    return { from: `${anchor.slice(0, 7)}-01`, to: anchor };
  if (preset === "quarter")
    return {
      from: `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`,
      to: anchor,
    };
  if (preset === "fy") return { from: `${fy}-04-01`, to: anchor };
  if (preset === "prior-fy")
    return { from: `${fy - 1}-04-01`, to: `${fy}-03-31` };
  return { from: "2024-10-01", to: anchor };
};
export const planningRows = (
  household: PlanningHousehold,
  filter: PlanningFilter,
) =>
  household.postings.filter(
    (p) =>
      p.date >= filter.from &&
      p.date <= filter.to &&
      (!filter.account || p.account === filter.account) &&
      (!filter.member || p.member === filter.member) &&
      (!filter.category || p.category === filter.category) &&
      (!filter.merchant ||
        p.merchant.toLowerCase().includes(filter.merchant.toLowerCase())),
  );
export const planningTotals = (rows: readonly PlanningPosting[]) =>
  rows.reduce(
    (sum, row) => ({
      income: sum.income + (row.kind === "income" ? row.minor : 0),
      spending:
        sum.spending +
        (["expense", "refund", "reimbursement", "interest"].includes(row.kind)
          ? -row.minor
          : 0),
      investing: sum.investing + (row.kind === "investment" ? -row.minor : 0),
      principal: sum.principal + (row.kind === "principal" ? -row.minor : 0),
      movement: sum.movement + row.minor,
    }),
    { income: 0, spending: 0, investing: 0, principal: 0, movement: 0 },
  );
export const planningBalances = (
  h: PlanningHousehold,
  through = planningAnchor,
) =>
  h.accounts.map((a) => ({
    ...a,
    closing:
      a.opening +
      h.postings
        .filter((p) => p.account === a.id && p.date <= through)
        .reduce((n, p) => n + p.minor, 0),
  }));
export const planningWealth = (h: PlanningHousehold) => {
  const cash = planningBalances(h).reduce((n, a) => n + a.closing, 0);
  const assets = h.holdings.reduce((n, a) => n + a.minor, cash);
  const investable = h.holdings
    .filter((a) => a.liquidity === "investable")
    .reduce((n, a) => n + a.minor, cash);
  return { cash, assets, net: assets - h.debt.principal, investable };
};
/** Explicit synthetic valuation reconstruction; never a claim of observed returns. */
export const planningWealthHistory = (h: PlanningHousehold) => {
  const months = [...new Set(h.postings.map((p) => p.date.slice(0, 7)))];
  const fixed = h.holdings
    .filter((a) => a.liquidity !== "investable")
    .reduce((n, a) => n + a.minor, 0);
  let capital = h.holdings
    .filter((a) => a.liquidity === "investable")
    .reduce((n, a) => n + a.minor, 0);
  const result: {
    date: string;
    net: number;
    capital: number;
    contribution: number;
    valuation: number;
    debt: number;
    cash: number;
  }[] = [];
  for (const month of months.reverse()) {
    const through =
      month === planningAnchor.slice(0, 7)
        ? planningAnchor
        : new Date(
            Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0),
          )
            .toISOString()
            .slice(0, 10);
    const contribution = planningTotals(
      h.postings.filter((p) => p.date.startsWith(month)),
    ).investing;
    const opening = Math.round((capital - contribution) / (1 + 500 / 120000));
    const valuation = capital - contribution - opening;
    const cash = planningBalances(h, through).reduce(
      (n, a) => n + a.closing,
      0,
    );
    const debt =
      h.debt.principal +
      h.postings
        .filter((p) => p.date > through && p.kind === "principal")
        .reduce((n, p) => n - p.minor, 0);
    result.push({
      date: through,
      capital,
      contribution,
      valuation,
      cash,
      debt,
      net: cash + capital + fixed - debt,
    });
    capital = opening;
  }
  return result.reverse();
};
export const planningAmortize = (debt: PlanningDebt, months: number) => {
  let principal = debt.principal;
  let interest = 0;
  let paidPrincipal = 0;
  for (let month = 0; month < months && principal > 0; month++) {
    const accrued = Math.round((principal * debt.rate) / 120000);
    const payment = Math.min(principal + accrued, debt.emi);
    interest += accrued;
    paidPrincipal += payment - accrued;
    principal += accrued - payment;
  }
  return { principal, interest, paidPrincipal };
};
export type PlanningYear = {
  year: number;
  age: number;
  opening: number;
  income: number;
  essential: number;
  discretionary: number;
  debtPayment: number;
  goals: number;
  growth: number;
  closing: number;
  gap: number;
  deflator: number;
  debt: number;
  sip: number;
};
export const planningProjection = (
  h: PlanningHousehold,
  a: PlanningAssumptions,
): PlanningYear[] => {
  let assets = planningWealth(h).investable;
  const prepayment = Math.min(a.prepayment, h.debt.principal, assets);
  assets -= prepayment;
  let debt = { ...h.debt, principal: h.debt.principal - prepayment };
  let deflator = 1;
  const years: PlanningYear[] = [];
  for (let i = 0; i <= Math.max(0, a.longevity - a.age); i++) {
    const year = 2027 + i;
    const age = a.age + i;
    const retired = age >= a.retireAge;
    let income = retired
      ? a.pension * 12
      : Math.round(a.income * 12 * (1 + a.incomeGrowth / 10000) ** i);
    const start = (year - a.breakYear) * 12;
    const breakMonths = Math.max(
      0,
      Math.min(12, a.breakMonths - Math.max(0, start)),
    );
    if (!retired && start >= 0)
      income = Math.round((income * (12 - breakMonths)) / 12);
    const essential = Math.round(
      (a.essential * 12 + (i < a.dependentYears ? a.dependent * 12 : 0)) *
        (1 + a.essentialInflation / 10000) ** (i + 1),
    );
    const discretionary = Math.round(
      (a.discretionary * 12 + a.rentChange * 12) *
        (1 + a.discretionaryInflation / 10000) ** (i + 1),
    );
    const amortized = planningAmortize(debt, 12);
    debt = { ...debt, principal: amortized.principal };
    const debtPayment = amortized.interest + amortized.paidPrincipal;
    const goals =
      (year === a.educationYear
        ? Math.round(
            a.education * (1 + a.essentialInflation / 10000) ** (i + 1),
          )
        : 0) + (year === a.breakYear ? a.medicalShock : 0);
    const returnRate =
      a.adverseSequence && retired && age - a.retireAge < 3
        ? ([-2000, -1000, 0][Math.max(0, age - a.retireAge)] ?? 0)
        : a.returnRate;
    const sip = retired
      ? 0
      : Math.min(
          Math.max(0, income - essential - discretionary - debtPayment - goals),
          Math.round(a.sip * 12 * (1 + a.sipStep / 10000) ** i),
        );
    // SIP is allocation of surplus, not an additional cash source. Half-year return on current contributions.
    const growth =
      Math.round((assets * (returnRate - a.fee)) / 10000) +
      Math.round((sip * (returnRate - a.fee)) / 20000);
    const closing =
      assets +
      income -
      essential -
      discretionary -
      debtPayment -
      goals +
      growth;
    if (
      ![
        assets,
        income,
        essential,
        discretionary,
        debtPayment,
        goals,
        growth,
        closing,
        sip,
      ].every(Number.isSafeInteger)
    ) {
      throw new RangeError(
        "These assumptions exceed the model's exact paise range. Reduce the amounts, growth rates or planning horizon.",
      );
    }
    deflator *= 1 + a.essentialInflation / 10000;
    years.push({
      year,
      age,
      opening: assets,
      income,
      essential,
      discretionary,
      debtPayment,
      goals,
      growth,
      closing: Math.max(0, closing),
      gap: Math.max(0, -closing),
      deflator,
      debt: debt.principal,
      sip,
    });
    assets = Math.max(0, closing);
  }
  return years;
};
export const evaluatePlanningProjection = (
  h: PlanningHousehold,
  a: PlanningAssumptions,
) =>
  Effect.runSync(
    Effect.either(
      Effect.try({
        try: () => planningProjection(h, a),
        catch: () =>
          "These assumptions exceed the model's exact paise range. Reduce the amounts, growth rates or planning horizon.",
      }),
    ),
  );
export const planningForecast = (h: PlanningHousehold, days = 90) => {
  let balance = planningWealth(h).cash;
  const rows: {
    date: string;
    income: number;
    expense: number;
    balance: number;
  }[] = [];
  for (let i = 1; i <= days; i++) {
    const date = planningDay(planningAnchor, i);
    const day = Number(date.slice(8));
    const income = day === 1 ? h.assumptions.income : 0;
    const expense =
      Math.round(
        ((h.assumptions.essential +
          h.assumptions.discretionary +
          h.assumptions.dependent) *
          12) /
          365,
      ) + (day === 5 ? h.debt.emi + h.assumptions.sip : 0);
    balance += income - expense;
    rows.push({ date, income, expense, balance });
  }
  return rows;
};
