import { expect, test } from "bun:test";
import {
  coreInvestment,
  defaultCorePlan,
  durationRange,
  finacleCore,
  formatNumber,
  formatWeeks,
  inr,
  usd,
} from "../src/site/core-investment/model";

test("five full-time people for ten weeks budget payroll and three subscription months separately", () => {
  const r = coreInvestment(defaultCorePlan);
  expect(r.personDays).toBe(250);
  expect(r.hours).toBe(2000);
  expect(r.payrollInr).toBeCloseTo((5 * 100000 * 120) / 52);
  expect(r.monthlySubscriptions).toBe(800);
  expect(r.billingMonths).toBe(3);
  expect(r.toolUsd).toBe(2400);
  expect(durationRange(r)).toBe("14–30 weeks");
});
test("five calendar months are exactly five billable months, including at the floating point boundary", () => {
  const r = coreInvestment({ ...defaultCorePlan, weeks: 65 / 3 });
  expect(r.months).toBeCloseTo(5);
  expect(r.billingMonths).toBe(5);
  expect(r.toolUsd).toBe(4000);
  expect(r.payrollInr).toBeCloseTo(2500000);
});
test("accounts and extra API change spend, without turning subscription fees into productivity", () => {
  const base = coreInvestment(defaultCorePlan);
  const two = coreInvestment({ ...defaultCorePlan, codex: 2 });
  const api = coreInvestment({ ...defaultCorePlan, monthlyApiUsd: 500 });
  expect(two.monthlySubscriptions).toBe(600);
  expect(two.toolUsd).toBe(1800);
  expect(api.toolUsd).toBeCloseTo(2400 + (500 * 120) / 52);
  for (const r of [two, api]) {
    expect(r.lowWeeks).toBe(base.lowWeeks);
    expect(r.highWeeks).toBe(base.highWeeks);
    expect(r.personDays).toBe(base.personDays);
    expect(r.payrollInr).toBe(base.payrollInr);
  }
});
test("changing people changes effort allocation and duration but never the historical reference", () => {
  const base = coreInvestment(defaultCorePlan);
  const ten = coreInvestment({ ...defaultCorePlan, people: 10 });
  expect(ten.personDays).toBe(500);
  expect(ten.payrollInr).toBeCloseTo(base.payrollInr * 2);
  expect(ten.highWeeks ?? Infinity).toBeLessThan(base.highWeeks ?? 0);
  expect(ten.finacleDays).toBe(120000);
  expect(ten.finacleUsd).toBe(30000000);
  expect(ten.finaclePeople).toBeCloseTo(120000 / 660);
});
test("no accounts or API removes the assisted drafting assumption", () => {
  const base = coreInvestment(defaultCorePlan);
  const none = coreInvestment({ ...defaultCorePlan, codex: 0, claude: 0 });
  expect(none.toolUsd).toBe(0);
  expect(none.highWeeks ?? 0).toBeGreaterThan(base.highWeeks ?? Infinity);
});

test("historical core allocation is an explicit fraction of release-wide anchors", () => {
  const r = coreInvestment(defaultCorePlan);
  expect(finacleCore.share).toBeGreaterThanOrEqual(finacleCore.shareLow);
  expect(finacleCore.share).toBeLessThanOrEqual(finacleCore.shareHigh);
  expect(r.finacleDays).toBe(finacleCore.publishedDays * finacleCore.share);
  expect(r.finacleUsd).toBe(finacleCore.publishedUsd * finacleCore.share);
});
test("display preserves separate currencies and a legible five-month duration", () => {
  expect(inr(2500000)).toBe("₹25,00,000");
  expect(usd(4000)).toBe("US$4,000");
  expect(formatNumber(120000)).toBe("1,20,000");
  expect(formatWeeks(65 / 3)).toBe("21.7");
  expect(formatWeeks(10)).toBe("10");
});
