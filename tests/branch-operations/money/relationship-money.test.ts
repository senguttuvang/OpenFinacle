import { expect, test } from "bun:test";
import { Schema } from "effect";
import {
  CoreChargesEvidence,
  CorePortfolioEvidence,
} from "../../../src/platform/branch-operations/domain/relationship";
import { coreAmount } from "../../../src/platform/branch-operations/ui/relationship-details";

const account = {
  id: 1,
  accountNo: "synthetic-only",
  status: { id: 300, value: "Active" },
  currency: { code: "INR", decimalPlaces: 2 },
};
test("Customer360 rejects unsupported native balance/charge precision rather than rounding source money", () => {
  for (const field of ["accountBalance", "availableBalance", "loanBalance"])
    for (const amount of [1.001, NaN, Infinity, 100000000000000])
      expect(
        Schema.is(CorePortfolioEvidence)({
          savingsAccounts: [{ ...account, [field]: amount }],
        }),
      ).toBe(false);
  for (const field of ["amount", "amountPaid", "amountOutstanding"])
    for (const amount of [1.001, NaN, Infinity, 100000000000000])
      expect(
        Schema.is(CoreChargesEvidence)([
          {
            id: 1,
            name: "Synthetic monetary charge",
            currency: account.currency,
            [field]: amount,
          },
        ]),
      ).toBe(false);
  expect(coreAmount(1.001, account.currency)).toContain("Unavailable");
});
test("valid explicit zero and signed native balances retain their values and native currency precision", () => {
  for (const amount of [0, -25.5, 12.34])
    expect(
      Schema.is(CorePortfolioEvidence)({
        savingsAccounts: [
          { ...account, accountBalance: amount, availableBalance: amount },
        ],
      }),
    ).toBe(true);
  expect(coreAmount(0, account.currency)).toBe("₹0.00");
  expect(coreAmount(-25.5, account.currency)).toBe("-₹25.50");
  const kwd = { code: "KWD", decimalPlaces: 3 };
  expect(
    Schema.is(CorePortfolioEvidence)({
      loanAccounts: [{ ...account, currency: kwd, loanBalance: 1.001 }],
    }),
  ).toBe(true);
  expect(coreAmount(1.001, kwd)).toBe("1.001 KWD");
  expect(coreAmount(123, { code: "JPY", decimalPlaces: 0 })).toBe("123 JPY");
});
test("missing or malformed currency precision cannot invent an amount or silently round a foreign source to zero", () => {
  expect(coreAmount(undefined, account.currency)).toBe("Not returned by core");
  expect(coreAmount(10, undefined)).toBe("Not returned by core");
  for (const currency of [
    { code: "INR" },
    { code: "INR", decimalPlaces: 3 },
    { code: "USD" },
    { code: "USD", decimalPlaces: -1 },
    { code: "USD", decimalPlaces: 2.5 },
    { code: "USD", decimalPlaces: 21 },
  ]) {
    expect(coreAmount(1.001, currency)).toContain("Unavailable");
    expect(
      Schema.is(CorePortfolioEvidence)({
        savingsAccounts: [{ ...account, currency, accountBalance: 1.001 }],
      }),
    ).toBe(false);
  }
  expect(coreAmount(1e-30, { code: "USD", decimalPlaces: 20 })).toContain(
    "Unavailable",
  );
  expect(coreAmount(NaN, { code: "USD", decimalPlaces: 2 })).toContain(
    "Unavailable",
  );
});
test("charge monetary fields remain distinct from percentage fields and native precision is preserved", () => {
  const charges = Schema.decodeUnknownSync(CoreChargesEvidence)([
    {
      id: 1,
      name: "Synthetic percentage-based charge",
      currency: account.currency,
      amount: 12.5,
      amountPaid: 0,
      amountOutstanding: 12.5,
      percentage: 1.001,
      amountOrPercentage: 1.001,
    },
  ]);
  expect(charges[0].amount).toBe(12.5);
  expect(charges[0].amountPaid).toBe(0);
  expect("percentage" in charges[0]).toBe(false);
  expect(coreAmount(charges[0].amount, charges[0].currency)).toBe("₹12.50");
});
