import { expect, test } from "bun:test";
import { Effect } from "effect";
import {
  buildRepaymentPilotCommand,
  repaymentPilotReport,
  verifyRepaymentPilotResponse,
} from "../../../src/operations/cli/loan-repayment-report";
import { repaymentInstruction } from "../../fixtures/loan-repayment";

type Options = Parameters<typeof buildRepaymentPilotCommand>[0];
const defaults: Options = {
  action: "status",
  role: "customer",
  loanId: "",
  id: "",
  offerId: "",
  key: "",
  version: -1,
  amountMinor: -1,
  note: "",
  accept: false,
};
const id = "30000000-0000-4000-8000-000000000003";
const loan = repaymentInstruction.offer.loan_id;
const build = (changes: Partial<Options>) =>
  Effect.runPromise(buildRepaymentPilotCommand({ ...defaults, ...changes }));
const denied = (changes: Partial<Options>) =>
  Effect.runPromise(
    buildRepaymentPilotCommand({ ...defaults, ...changes }).pipe(Effect.flip),
  );
test("repayment administration requires a chosen original target, exact amount, explicit consent and separate reviewed roles", async () => {
  expect(await build({ loanId: loan })).toEqual({
    kind: "list",
    role: "customer",
    loan_id: loan,
  });
  expect(await build({ id })).toEqual({ kind: "detail", role: "customer", id });
  expect(await build({ key: "original-reference-key" })).toEqual({
    kind: "reference",
    role: "customer",
    key: "original-reference-key",
  });
  const invalid: Partial<Options>[] = [
    {},
    { id, loanId: loan },
    { key: "original-key", id },
    { action: "quote" },
    { action: "quote", loanId: loan, amountMinor: 1.5 },
    { action: "quote", loanId: loan, amountMinor: 100000, role: "officer" },
    {
      action: "quote",
      loanId: loan,
      amountMinor: 100000,
      key: "unrelated-key",
    },
    {
      action: "submit",
      offerId: repaymentInstruction.offer.id,
      key: "consent-key",
    },
    {
      action: "submit",
      offerId: repaymentInstruction.offer.id,
      key: "consent-key",
      accept: true,
      role: "approver",
    },
    { action: "pay", role: "approver", id, version: 1, key: "payment-key" },
    {
      action: "pay",
      role: "officer",
      id,
      version: 1,
      key: "payment-key",
      note: "Reviewed payment",
    },
    {
      action: "pay",
      role: "approver",
      id,
      version: 1,
      key: "payment-key",
      note: "Reviewed payment",
      amountMinor: 100000,
    },
    { action: "inspect", role: "customer", id },
    { action: "inspect", role: "approver", id, key: "unrelated-key" },
  ];
  for (const input of invalid)
    expect(await denied(input)).toBeInstanceOf(Error);
  expect(
    await build({ action: "quote", loanId: loan, amountMinor: 100000 }),
  ).toEqual({
    kind: "quote",
    role: "customer",
    input: { loan_id: loan, amount_minor: 100000 },
  });
  expect(
    await build({
      action: "submit",
      offerId: repaymentInstruction.offer.id,
      key: "consent-key",
      accept: true,
    }),
  ).toEqual({
    kind: "submit",
    role: "customer",
    submission: { offer_id: repaymentInstruction.offer.id, consent: true },
    key: "consent-key",
  });
  expect(
    await build({
      action: "pay",
      role: "approver",
      id,
      version: 1,
      key: "payment-key",
      note: "  Independently reviewed payment  ",
    }),
  ).toEqual({
    kind: "action",
    role: "approver",
    command: {
      id,
      version: 1,
      action: "pay",
      note: "Independently reviewed payment",
    },
    key: "payment-key",
  });
});

test("pilot quote receipts bind the chosen loan and amount and reports contain only review/evidence fields", async () => {
  const command = await build({
    action: "quote",
    loanId: loan,
    amountMinor: 100000,
  });
  const preview = {
    source: "fineract" as const,
    offer: repaymentInstruction.offer,
    request_created: false as const,
    financial_posted: false as const,
  };
  expect(
    await Effect.runPromise(verifyRepaymentPilotResponse(command, preview)),
  ).toEqual(preview);
  for (const change of [
    { loan_id: crypto.randomUUID() },
    { amount_minor: 200000 },
  ]) {
    expect(
      await Effect.runPromise(
        verifyRepaymentPilotResponse(command, {
          ...preview,
          offer: { ...preview.offer, ...change },
        }).pipe(Effect.flip),
      ),
    ).toBeInstanceOf(Error);
  }
  expect(repaymentPilotReport(preview)).toMatchObject({
    loan_id: loan,
    offer_id: preview.offer.id,
    amount_minor: 100000,
    financial_posted: false,
    request_created: false,
  });
  expect(JSON.stringify(repaymentPilotReport(preview))).not.toContain("owner");
});
