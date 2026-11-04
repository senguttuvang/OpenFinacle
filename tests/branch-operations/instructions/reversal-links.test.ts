import { expect, test } from "bun:test";
import { branchDayFixture } from "../../../src/demo/branch/branch-day-fixture";
import type { BankingCommand } from "../../../src/platform/banking-workspace/domain/banking";
import {
  cashReversalTrace,
  ownedInstruction,
} from "../../../src/platform/branch-operations/domain/instructions/reversal-links";

const setup = () => {
  const day = branchDayFixture(),
    r = day.relationships[0],
    original = r.commands[0];
  original.status = "posted";
  original.approver = "approver";
  original.amount_minor = 12525;
  original.core_id = 387;
  original.payload = JSON.stringify({ kind: "deposit", amount: 125.25 });
  const account = r.account;
  if (!account) throw Error("Fixture account");
  account.transactions = [
    {
      id: 387,
      accountId: r.customer.account_id,
      accountNo: r.customer.account_no,
      currency: { code: "INR", decimalPlaces: 2 },
      date: [2026, 11, 4],
      amount: 125.25,
      entryType: "CREDIT",
      reversed: false,
      transactionType: { value: "Deposit", deposit: true, withdrawal: false },
    },
  ];
  const native = account.transactions[0];
  const reverse = (
    status: BankingCommand["status"] = "posted",
  ): BankingCommand => ({
    ...original,
    id: `reversal-${status}`,
    key: `reversal-key-${status}`,
    kind: "reverse",
    status,
    amount_minor: 0,
    core_id: status === "posted" ? r.customer.account_id : null,
    payload: JSON.stringify({ kind: "reverse", originalId: original.id }),
  });
  return { day, r, original, native, account, reverse };
};
test("supported original cash evidence requires owned source and exact native reference, currency, kind, amount and known state", () => {
  const { r, original, native } = setup();
  const value = cashReversalTrace(r, original, false);
  expect(value.canRequest).toBe(true);
  expect(value.native).toBe(native);
  expect(value.original).toBe(original);
  expect(value.reversals).toEqual([]);
  native.entryType = "DEBIT";
  expect(cashReversalTrace(r, original, false).canRequest).toBe(false);
});
test("each active reversal state blocks another request while failed/rejected records remain distinct inspectable history", () => {
  for (const status of [
    "pending",
    "executing",
    "posted",
    "uncertain",
    "failed",
    "rejected",
  ] as const) {
    const { r, original, native, reverse } = setup();
    const reversal = reverse(status);
    r.commands.push(reversal);
    native.reversed = status === "posted";
    const value = cashReversalTrace(r, original, false);
    expect(value.reversals).toEqual([reversal]);
    expect(value.canRequest).toBe(status === "failed" || status === "rejected");
    expect(value.blocking.length).toBe(
      status === "failed" || status === "rejected" ? 0 : 1,
    );
  }
});
test("a reversal resolves its original only through explicit same-bank/account payload identity, never its generic Core response reference", () => {
  const { r, original, native, reverse } = setup();
  const reversal = reverse();
  r.commands.push(reversal);
  native.reversed = true;
  const value = cashReversalTrace(r, reversal, false);
  expect(reversal.amount_minor).toBe(0);
  expect(reversal.core_id).toBe(r.customer.account_id);
  expect(value.original?.id).toBe(original.id);
  expect(value.native?.id).toBe(387);
  expect(value.native?.amount).toBe(125.25);
  expect(value.canRequest).toBe(false);
});
test("foreign, malformed, unsupported and ambiguous saved original links cannot become navigation or eligibility", () => {
  for (const patch of [
    { bank_id: "foreign" },
    { account_id: 9999 },
    { payload: "not-json" },
    { payload: "null" },
    { payload: JSON.stringify({ kind: "reverse", originalId: 42 }) },
    {
      payload: JSON.stringify({ kind: "deposit", originalId: "instruction-0" }),
    },
  ]) {
    const { r, reverse } = setup();
    const reversal = { ...reverse(), ...patch };
    r.commands.push(reversal);
    expect(cashReversalTrace(r, reversal, false).original).toBeNull();
  }
  const { r, original, reverse } = setup();
  const reversal = reverse();
  r.commands.push(reversal, { ...original });
  expect(ownedInstruction(r, original.id)).toBeNull();
  expect(cashReversalTrace(r, reversal, false).original).toBeNull();
});
test("limited or malformed active history cannot certify that no reversal exists", () => {
  const { r, original, reverse } = setup();
  expect(cashReversalTrace(r, original, true)).toMatchObject({
    canRequest: false,
    complete: false,
    reason: "history_incomplete",
  });
  r.commands.push({ ...reverse("pending"), payload: "invalid" });
  expect(cashReversalTrace(r, original, false)).toMatchObject({
    canRequest: false,
    complete: false,
    reason: "history_incomplete",
  });
});
test("a native reversed or missing reversal flag remains distinct from eligibility even without a loaded saved reversal", () => {
  const { r, original, native } = setup();
  native.reversed = true;
  expect(cashReversalTrace(r, original, false)).toMatchObject({
    canRequest: false,
    reason: "already_reversed",
  });
  delete native.reversed;
  expect(cashReversalTrace(r, original, false)).toMatchObject({
    canRequest: false,
    reason: "native_state_unknown",
  });
});
test("uncorroborated native identity, amount, calendar, precision or direction withholds eligibility instead of guessing", () => {
  for (const patch of [
    { amount: 125.251 },
    { amount: 0 },
    { amount: NaN },
    { accountId: 9999 },
    { accountNo: "foreign" },
    { date: [2026, 2, 30] },
    { entryType: undefined },
    { currency: { code: "INR", decimalPlaces: 3 } },
    {
      transactionType: { value: "Interest", deposit: false, withdrawal: false },
    },
    {
      transactionType: {
        value: "Contradictory",
        deposit: true,
        withdrawal: true,
      },
    },
  ]) {
    const { r, original, account, native } = setup();
    account.transactions = [{ ...native, ...patch }];
    expect(cashReversalTrace(r, original, false).native).toBeNull();
    expect(cashReversalTrace(r, original, false).canRequest).toBe(false);
  }
  const { r, original, account } = setup();
  account.clientId = 9999;
  expect(cashReversalTrace(r, original, false).native).toBeNull();
  r.account = null;
  expect(cashReversalTrace(r, original, false).canRequest).toBe(false);
});
test("posted withdrawal uses its own native debit evidence and unsupported original kinds do not acquire reversal links", () => {
  const { r, original, native, reverse } = setup();
  original.kind = "withdrawal";
  native.entryType = "DEBIT";
  native.transactionType = {
    value: "Withdrawal",
    deposit: false,
    withdrawal: true,
  };
  expect(cashReversalTrace(r, original, false).canRequest).toBe(true);
  original.kind = "transfer";
  const reversal = reverse();
  r.commands.push(reversal);
  expect(cashReversalTrace(r, reversal, false).original).toBeNull();
});

test("duplicate reversal identifiers withhold their links and cannot certify complete history", () => {
  const { r, original, reverse } = setup();
  const c = reverse("pending");
  r.commands.push(c, { ...c });
  expect(cashReversalTrace(r, original, false)).toMatchObject({
    canRequest: false,
    complete: false,
    reversals: [],
    reason: "history_incomplete",
  });
});

test("reversal and restriction request sentinels are not presented as monetary zero effects", async () => {
  const { InstructionAmount } = await import(
    "../../../src/platform/branch-operations/ui/instructions/reversal-links"
  );
  const { original, reverse } = setup();
  expect(InstructionAmount({ command: reverse() })).toContain(
    "No separate monetary amount",
  );
  for (const kind of ["freeze", "unfreeze"] as const)
    expect(
      InstructionAmount({ command: { ...original, kind, amount_minor: 0 } }),
    ).toBe("Not a monetary instruction.");
  expect(InstructionAmount({ command: original })).toBe("₹125.25");
});
