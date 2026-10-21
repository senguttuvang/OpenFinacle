import { expect, test } from "bun:test";
import { Schema } from "effect";
import {
  LoanPending,
  ownedLoanDetail,
  repeatableLoanDraft,
  unresolvedLoanOriginal,
  verifiedLoanReceipt,
} from "../../../src/platform/lending/ui/loan-api";
import { loanView } from "../../fixtures/loan-view";

test("loan receipts bind the original actor, key, quote or command and cannot clear a different pending instruction", () => {
  const detail = loanView();
  const original: LoanPending = {
    key: "original-customer-key",
    role: "customer",
    instruction: {
      kind: "submit",
      input: { quote_id: detail.quote.id, consent: true },
    },
  };
  const receipt = {
    ...detail,
    recorded_key: original.key,
    recorded_actor: original.role,
    recorded_request: original.instruction.input,
  };
  expect(verifiedLoanReceipt(receipt, original)).toBe(true);
  expect(
    verifiedLoanReceipt(
      {
        ...receipt,
        loan: { ...receipt.loan, quote_id: "different-owned-quote" },
        quote: { ...receipt.quote, id: "different-owned-quote" },
      },
      original,
    ),
  ).toBe(false);
  expect(
    verifiedLoanReceipt({ ...receipt, recorded_key: "another-key" }, original),
  ).toBe(false);
  expect(
    verifiedLoanReceipt({ ...receipt, recorded_actor: "officer" }, original),
  ).toBe(false);
  expect(
    verifiedLoanReceipt(
      {
        ...receipt,
        recorded_request: { quote_id: "another-quote", consent: true },
      },
      original,
    ),
  ).toBe(false);
  const command = {
    key: "original-core-key",
    role: "approver",
    instruction: {
      kind: "action",
      input: {
        id: detail.loan.id,
        version: 1,
        action: "register",
        note: "Reviewed invented quote",
      },
    },
  } satisfies LoanPending;
  const recorded = {
    ...detail,
    recorded_key: command.key,
    recorded_actor: command.role,
    recorded_request: command.instruction.input,
    recorded_operation: {
      id: "original-operation",
      key: command.key,
      actor: "approver" as const,
      action: "register" as const,
      status: "uncertain" as const,
      version: 1,
      started_at: detail.loan.accepted_at + 1,
      observed_at: detail.loan.accepted_at + 2,
      error: null,
    },
  };
  expect(verifiedLoanReceipt(recorded, command)).toBe(true);
  expect(unresolvedLoanOriginal(recorded)).toBe(true);
  expect(
    verifiedLoanReceipt({ ...recorded, recorded_operation: null }, command),
  ).toBe(false);
  expect(
    verifiedLoanReceipt(
      {
        ...recorded,
        recorded_operation: {
          ...recorded.recorded_operation,
          key: "later-operation-key",
        },
      },
      command,
    ),
  ).toBe(false);
  expect(
    verifiedLoanReceipt(
      {
        ...recorded,
        recorded_request: { ...command.instruction.input, version: 2 },
      },
      command,
    ),
  ).toBe(false);
  expect(
    verifiedLoanReceipt(
      { ...recorded, loan: { ...recorded.loan, id: "different-owned-loan" } },
      command,
    ),
  ).toBe(false);
  expect(repeatableLoanDraft(command)).toBe(false);
  expect(repeatableLoanDraft(original)).toBe(true);
  expect(
    repeatableLoanDraft({
      ...command,
      instruction: {
        kind: "action",
        input: { ...command.instruction.input, action: "request_withdrawal" },
      },
    }),
  ).toBe(true);
  expect(
    Schema.decodeUnknownOption(Schema.parseJson(LoanPending))(
      JSON.stringify({
        ...original,
        instruction: {
          ...original.instruction,
          input: { quote_id: detail.quote.id, consent: false },
        },
      }),
    )._tag,
  ).toBe("None");
});
test("owned loan views reject incomplete histories, mismatched quotes and foreign owners before showing a saved result", () => {
  const detail = loanView();
  expect(ownedLoanDetail(detail, detail.loan.bank_id)).toBe(true);
  expect(ownedLoanDetail(detail, "another-bank")).toBe(false);
  expect(
    ownedLoanDetail(
      { ...detail, loan: { ...detail.loan, quote_id: "different-quote" } },
      detail.loan.bank_id,
    ),
  ).toBe(false);
  expect(
    ownedLoanDetail(
      { ...detail, loan: { ...detail.loan, version: 1 } },
      detail.loan.bank_id,
    ),
  ).toBe(false);
  expect(ownedLoanDetail({ ...detail, history: [] }, detail.loan.bank_id)).toBe(
    false,
  );
  expect(
    ownedLoanDetail(
      { ...detail, history: [{ ...detail.history[0], version: 2 }] },
      detail.loan.bank_id,
    ),
  ).toBe(false);
  expect(
    ownedLoanDetail(
      { ...detail, history: [{ ...detail.history[0], status: "cancelled" }] },
      detail.loan.bank_id,
    ),
  ).toBe(false);
  expect(
    ownedLoanDetail(
      {
        ...detail,
        quote: {
          ...detail.quote,
          terms: { ...detail.quote.terms, principal: 13000 },
        },
      },
      detail.loan.bank_id,
    ),
  ).toBe(false);
});
