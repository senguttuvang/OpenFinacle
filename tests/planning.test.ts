import { describe, expect, test } from "bun:test";
import {
  planningAmortize,
  planningBalances,
  planningForecast,
  planningMonthRange,
  planningProjection,
  planningRange,
  planningRows,
  planningTotals,
  planningWealth,
  planningWealthHistory,
} from "../src/domain/planning";
import { planningHouseholds } from "../src/domain/planning-fixtures";

const households = planningHouseholds();
const h = households[1]!;
const all = {
  ...planningRange("all"),
  account: "",
  member: "",
  category: "",
  merchant: "",
};
describe("synthetic household planning", () => {
  test("wealth history separates contributions and valuation and reconciles to current wealth", () => {
    for (const household of households) {
      const history = planningWealthHistory(household);
      expect(history.at(-1)?.net).toBe(planningWealth(household).net);
      for (let index = 1; index < history.length; index++) {
        const row = history[index]!;
        expect(row.capital - history[index - 1]!.capital).toBe(
          row.contribution + row.valuation,
        );
      }
    }
  });
  test("seeded postings reconcile every account and internal transfer pair", () => {
    expect(planningHouseholds()).toEqual(households);
    const count = households.reduce(
      (n, household) => n + household.postings.length,
      0,
    );
    expect(count).toBeGreaterThan(2500);
    expect(count).toBeLessThan(4000);
    for (const household of households) {
      expect(
        planningBalances(household).reduce(
          (n, a) => n + a.closing - a.opening,
          0,
        ),
      ).toBe(planningTotals(household.postings).movement);
      const links = new Set(
        household.postings
          .filter((p) => p.kind === "transfer")
          .map((p) => p.link),
      );
      for (const link of links)
        expect(
          household.postings
            .filter((p) => p.link === link)
            .reduce((n, p) => n + p.minor, 0),
        ).toBe(0);
      expect(
        household.postings.every((p) => Number.isSafeInteger(p.minor)),
      ).toBe(true);
    }
  });
  test("consumption counts card purchases once, nets partial refunds, excludes principal and investments", () => {
    const rows = h.postings.filter((p) => p.date.slice(0, 7) === "2026-01");
    const totals = planningTotals(rows);
    expect(totals.spending).toBe(
      -rows
        .filter(
          (p) =>
            p.kind === "expense" ||
            p.kind === "reimbursement" ||
            p.kind === "refund" ||
            p.kind === "interest",
        )
        .reduce((n, p) => n + p.minor, 0),
    );
    expect(
      planningTotals(rows.filter((p) => p.kind === "transfer")).spending,
    ).toBe(0);
    expect(
      planningTotals(
        rows.filter(
          (p) => p.merchant.startsWith("Synthetic Loom") && p.link !== null,
        ),
      ).spending,
    ).toBe(120000);
    expect(totals.principal).toBeGreaterThan(0);
  });
  test("FY boundaries, date/account/member/category/merchant filters reconcile detail", () => {
    const parent = {
      ...all,
      from: "2026-07-20",
      to: "2026-08-05",
      account: h.accounts[0]!.id,
      member: "Nila",
    };
    expect(planningMonthRange(parent, "2026-07")).toEqual({
      ...parent,
      to: "2026-07-31",
    });
    expect(planningMonthRange(parent, "2026-08")).toEqual({
      ...parent,
      from: "2026-08-01",
    });
    expect(planningRange("fy", "2026-03-31")).toEqual({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    expect(planningRange("prior-fy", "2026-04-01")).toEqual({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    const filter = {
      ...all,
      ...planningRange("90"),
      member: "Dev",
      category: "Dining",
      merchant: "pepper",
    };
    const rows = planningRows(h, filter);
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (p) =>
          p.member === "Dev" &&
          p.category === "Dining" &&
          p.date >= filter.from,
      ),
    ).toBe(true);
    expect(planningTotals(rows).spending).toBe(
      -rows.reduce((n, p) => n + p.minor, 0),
    );
    expect(
      planningRows(h, { ...all, from: "2030-01-01", to: "2030-02-01" }),
    ).toEqual([]);
  });
  test("zero-rate debt and prepayment reduce interest without creating capital", () => {
    expect(
      planningAmortize({ principal: 120000, rate: 0, emi: 10000 }, 12),
    ).toEqual({ principal: 0, interest: 0, paidPrincipal: 120000 });
    const normal = planningProjection(h, h.assumptions);
    const prepaid = planningProjection(h, {
      ...h.assumptions,
      prepayment: 50000000,
    });
    expect(normal[0]!.opening - prepaid[0]!.opening).toBe(50000000);
    expect(prepaid.reduce((n, y) => n + y.debtPayment, 0)).toBeLessThan(
      normal.reduce((n, y) => n + y.debtPayment, 0),
    );
    expect(prepaid[0]!.debt).toBeLessThan(normal[0]!.debt);
  });
  test("projection cash flow identities, inflation and early market sequence are reproducible", () => {
    const rows = planningProjection(h, h.assumptions);
    for (const row of rows)
      expect(row.closing - row.gap).toBe(
        row.opening +
          row.income +
          row.growth -
          row.essential -
          row.discretionary -
          row.debtPayment -
          row.goals,
      );
    expect(rows[1]!.deflator).toBeGreaterThan(rows[0]!.deflator);
    const early = {
      ...h.assumptions,
      retireAge: h.assumptions.age,
      adverseSequence: true,
    };
    expect(planningProjection(h, early)[0]!.growth).toBeLessThan(0);
    const exhausted = planningProjection(h, {
      ...early,
      essential: 100000000,
      pension: 0,
    });
    expect(exhausted.some((y) => y.gap > 0)).toBe(true);
    expect(exhausted.every((y) => y.closing >= 0)).toBe(true);
    expect(planningWealth(h).investable).toBeLessThan(planningWealth(h).assets);
  });
  test("forecast is future assumptions and has daily balance identity", () => {
    const wealth = planningWealth(h);
    expect(wealth.assets - wealth.liabilities).toBe(wealth.net);
    expect(wealth.grossCash - wealth.cardLiability).toBe(wealth.cash);
    const alternate = planningForecast(h, 90, { ...h.assumptions, income: 0 });
    const normal = planningForecast(h);
    const retired = planningForecast(h, 90, {
      ...h.assumptions,
      retireAge: h.assumptions.age,
      pension: 0,
    });
    expect(
      retired
        .filter((row) => row.date.endsWith("-01"))
        .every((row) => row.income === 0),
    ).toBe(true);
    expect(
      normal.find((row) => row.date.endsWith("-05"))!.expense -
        retired.find((row) => row.date.endsWith("-05"))!.expense,
    ).toBe(h.assumptions.sip);
    expect(normal.at(-1)!.balance - alternate.at(-1)!.balance).toBe(
      h.assumptions.income * 3,
    );
    const rows = planningForecast(h);
    expect(rows).toHaveLength(90);
    expect(rows[0]!.date).toBe("2026-10-18");
    let balance = planningWealth(h).cash;
    for (const row of rows) {
      balance += row.income - row.expense;
      expect(row.balance).toBe(balance);
    }
  });
});
