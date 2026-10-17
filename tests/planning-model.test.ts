import { expect, test } from "bun:test";
import { Schema } from "effect";
import {
  evaluatePlanningProjection,
  PlanningAssumptions,
  type PlanningHousehold,
  planningAmortize,
  planningBalances,
  planningDay,
  planningForecast,
  planningModel,
  planningMoney,
  planningProjection,
  planningRange,
  planningRows,
  planningTotals,
  planningWealth,
  planningWealthHistory,
} from "../src/domain/planning";

const assumptions = {
  age: 40,
  retireAge: 60,
  longevity: 90,
  income: 10000000,
  essential: 3000000,
  discretionary: 1000000,
  pension: 0,
  dependent: 0,
  dependentYears: 0,
  essentialInflation: 600,
  discretionaryInflation: 500,
  incomeGrowth: 500,
  returnRate: 700,
  fee: 50,
  sip: 2000000,
  sipStep: 500,
  prepayment: 0,
  education: 0,
  educationYear: 2035,
  breakYear: 2028,
  breakMonths: 0,
  medicalShock: 0,
  rentChange: 0,
  adverseSequence: false,
};
const household: PlanningHousehold = {
  id: "synthetic-model",
  name: "Synthetic model household",
  city: "Illustrative",
  description: "Arithmetic fixture",
  members: ["Synthetic owner"],
  assumptions,
  accounts: [
    { id: "cash", label: "Cash", owners: "Synthetic owner", opening: 10000000 },
  ],
  postings: [
    {
      id: "synthetic-income",
      date: "2026-10-01",
      account: "cash",
      member: "Synthetic owner",
      merchant: "Synthetic employer",
      minor: 10000000,
      category: "Salary",
      kind: "income",
      link: null,
    },
    {
      id: "synthetic-spend",
      date: "2026-10-02",
      account: "cash",
      member: "Synthetic owner",
      merchant: "Synthetic groceries",
      minor: -2000000,
      category: "Food",
      kind: "expense",
      link: null,
    },
  ],
  holdings: [],
  debt: { principal: 0, rate: 850, emi: 0 },
};
test("minor-unit model filters, balance identity, calendar boundaries and forecast are explicit", () => {
  const record = {
    model: planningModel,
    assumptions: Schema.decodeUnknownSync(PlanningAssumptions)(assumptions),
  };
  expect(record.assumptions.income).toBe(10000000);
  expect(
    Schema.decodeUnknownEither(PlanningAssumptions)({
      ...assumptions,
      income: 0.1,
    })._tag,
  ).toBe("Left");
  expect(planningRange("fy", "2026-04-01")).toEqual({
    from: "2026-04-01",
    to: "2026-04-01",
  });
  expect(planningDay("2024-02-28", 1)).toBe("2024-02-29");
  const rows = planningRows(household, {
    ...planningRange("month"),
    category: "Food",
    merchant: "groceries",
    account: "cash",
    member: "Synthetic owner",
  });
  expect(planningTotals(rows).spending).toBe(2000000);
  expect(planningBalances(household)[0]?.closing).toBe(18000000);
  expect(planningWealth(household).net).toBe(18000000);
  expect(planningWealthHistory(household).at(-1)?.net).toBe(18000000);
  expect(planningMoney(123456789)).toContain("12,34,568");
  const forecast = planningForecast(household, 1);
  expect(forecast[0]?.balance).toBe(
    18000000 - Math.round((4000000 * 12) / 365),
  );
});
test("cash-flow projection and debt never invent funding on depletion or prepayment", () => {
  const overdrawn = {
    ...household,
    postings: [],
    holdings: [],
    accounts: [
      {
        id: "cash",
        label: "Overdrawn synthetic cash",
        owners: "Synthetic owner",
        opening: -10000,
      },
    ],
    debt: { principal: 1000000, rate: 0, emi: 0 },
  };
  const deficit = planningProjection(overdrawn, {
    ...assumptions,
    income: 0,
    essential: 0,
    discretionary: 0,
    sip: 0,
    prepayment: 100000,
  });
  expect(deficit[0]?.opening).toBe(-10000);
  expect(deficit[0]?.growth).toBe(0);
  expect(deficit[0]?.gap).toBe(10000);
  expect(deficit[0]?.debt).toBe(1000000);
  expect(
    evaluatePlanningProjection(household, {
      ...assumptions,
      age: 25,
      longevity: 100,
      income: 900000000000,
      incomeGrowth: 2000,
      returnRate: 2000,
    })._tag,
  ).toBe("Left");
  expect(
    planningAmortize({ principal: 120000, rate: 0, emi: 10000 }, 12).principal,
  ).toBe(0);
  const zero = planningProjection(household, {
    ...assumptions,
    income: 0,
    returnRate: 0,
    fee: 0,
    essential: 10000000,
    discretionary: 0,
    sip: 0,
  });
  expect(zero[0]?.closing).toBe(0);
  expect(zero[0]?.gap).toBe(109200000);
  const normal = planningProjection(household, assumptions);
  expect(normal[0]!.essential / normal[0]!.deflator).toBe(
    assumptions.essential * 12,
  );
  const broken = planningProjection(household, {
    ...assumptions,
    breakMonths: 12,
    breakYear: 2027,
  });
  expect(broken[0]?.income).toBe(0);
  expect(broken[0]!.closing).toBeLessThan(normal[0]!.closing);
  for (const row of normal)
    expect(row.closing - row.gap).toBe(
      row.opening +
        row.income +
        row.growth -
        row.essential -
        row.discretionary -
        row.debtPayment -
        row.goals,
    );
});
