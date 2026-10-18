import {
  loanRepaymentCoreKey,
  loanRepaymentMarker,
} from "../../src/platform/lending/domain/repayments/loan-repayment-identity";
import type {
  LoanRepaymentInstruction,
  LoanRepaymentLookup,
} from "../../src/platform/lending/domain/repayments/loan-repayments";
import { inventedLoanStatement } from "./loan-statement";
import {
  workflowQuote,
  workflowQuotedAt,
  workflowResult,
} from "./loan-workflow";

export const repaymentLookup: LoanRepaymentLookup = {
  loan_id: "b60427be-942d-45f5-b19a-36b855babbc3",
  core_id: 71,
  external_id: "of-loan-b60427be-942d-45f5-b19a-36b855babbc3",
  owner: {
    bank_id: workflowQuote.bank_id,
    client_id: 41,
    product_id: 31,
    savings_account_id: 51,
  },
  terms: workflowQuote.terms,
  expected_disbursement_date: workflowQuote.expected_disbursement_date,
};
const operationId = "20000000-0000-4000-8000-000000000002";
export const repaymentInstruction: LoanRepaymentInstruction = {
  operation_id: operationId,
  key: loanRepaymentCoreKey(operationId),
  consented_at: workflowQuotedAt + 30000,
  note: "Independently reviewed invented partial repayment.",
  offer: {
    ...repaymentLookup,
    id: "10000000-0000-4000-8000-000000000001",
    office_id: 1,
    amount_minor: 100000,
    principal_outstanding_minor: 1200000,
    outstanding_minor: 1320000,
    available_minor: 2000000,
    payment_date: "2026-10-17",
    quoted_at: workflowQuotedAt,
    expires_at: workflowQuotedAt + 900000,
  },
};
const originalLoan = workflowResult({
  ...repaymentLookup,
  quote: workflowQuote,
  action: "disburse",
  date: "2026-10-17",
  consented_at: workflowQuotedAt + 1,
  key: "invented-original-funding",
  note: "Invented original funding.",
  transaction_external_id: "invented-original-disbursement",
}).loan;
export const repaymentBefore = {
  ...originalLoan,
  statement: inventedLoanStatement(originalLoan),
};
export const repaymentAfter = {
  ...repaymentBefore,
  principal_outstanding_minor: 1110000,
  outstanding_minor: 1220000,
  statement: {
    ...repaymentBefore.statement,
    principal_paid_minor: 90000,
    interest_paid_minor: 10000,
    repayment_minor: 100000,
    principal_outstanding_minor: 1110000,
    interest_outstanding_minor: 110000,
    outstanding_minor: 1220000,
    transactions: [
      ...repaymentBefore.statement.transactions,
      {
        id: 82,
        type_id: 2,
        date: "2026-10-17",
        amount_minor: 100000,
        principal_minor: 90000,
        interest_minor: 10000,
        fees_minor: 0,
        penalties_minor: 0,
        overpayment_minor: 0,
        unrecognized_income_minor: 0,
        manually_reversed: false,
        reversed_on_date: null,
        transfer: {
          id: 92,
          date: "2026-10-17",
          amount_minor: 100000,
          reversed: false,
          repayment_marker: loanRepaymentMarker(operationId),
        },
      },
    ],
  },
};
const currency = { code: "INR", decimalPlaces: 2 };
export const repaymentSavings = {
  id: 51,
  clientId: 41,
  currency,
  status: { active: true },
  withdrawalFeeForTransfers: false,
  summary: { availableBalance: 20000 },
  transactions: [],
};
export const repaymentSavingsAfter = {
  ...repaymentSavings,
  summary: { availableBalance: 19000 },
  transactions: [
    {
      id: 102,
      accountId: 51,
      transactionType: { id: 2 },
      currency,
      date: [2026, 10, 17],
      amount: 1000,
      reversed: false,
      isReversal: false,
      transfer: {
        id: 92,
        currency,
        transferAmount: 1000,
        transferDate: [2026, 10, 17],
        reversed: false,
        transferDescription: loanRepaymentMarker(operationId),
      },
    },
  ],
};
export const repaymentFullTransfer = {
  id: 92,
  currency,
  reversed: false,
  transferAmount: 1000,
  transferDate: "2026-10-17",
  transferDescription: loanRepaymentMarker(operationId),
  fromOffice: { id: 1 },
  toOffice: { id: 1 },
  fromClient: { id: 41 },
  toClient: { id: 41 },
  fromAccountType: { id: 2 },
  toAccountType: { id: 1 },
  fromAccount: { id: 51 },
  toAccount: { id: 71 },
};
