import type {
  LoanWriteInstruction,
  LoanWriteResult,
} from "../../src/domain/loan-writing";
import type { LoanQuote } from "../../src/domain/loans";

export const workflowQuotedAt = Date.parse("2026-10-17T09:00:00Z");
export const workflowQuote: LoanQuote = {
  id: "invented-workflow-quote",
  bank_id: "loan-test-bank",
  product_id: 31,
  client_id: 41,
  savings_account_id: 51,
  terms: {
    product: "core-personal",
    principal: 12000,
    months: 12,
    purpose: "education",
    monthly_income: 30000,
    monthly_commitments: 5000,
    monthly_expenses: 10000,
  },
  expected_disbursement_date: "2026-10-17",
  quoted_at: workflowQuotedAt,
  expires_at: workflowQuotedAt + 900000,
  // Invented components; real pricing remains a separate running-Core proof.
  schedule: {
    currency: "INR",
    principal_minor: 1200000,
    interest_minor: 120000,
    repayment_minor: 1320000,
    installments: Array.from({ length: 12 }, (_, index) => ({
      period: index + 1,
      due_date: new Date(Date.UTC(2026, 10 + index, 17))
        .toISOString()
        .slice(0, 10),
      principal_minor: 100000,
      interest_minor: 10000,
      total_minor: 110000,
    })),
  },
};
export const workflowResult = (
  input: LoanWriteInstruction,
): LoanWriteResult => {
  const funded = input.action === "disburse";
  const transfer = {
    id: 91,
    reversed: false,
    amount_minor: input.quote.schedule.principal_minor,
    date: input.date,
  };
  return {
    loan: {
      id: input.core_id ?? 71,
      external_id: input.external_id,
      owner: input.owner,
      status:
        input.action === "approve"
          ? "approved"
          : funded
            ? "active"
            : input.action === "withdraw"
              ? "withdrawn"
              : "registered",
      principal_minor: input.quote.schedule.principal_minor,
      annual_rate_bps: 1200,
      expected_disbursement_date: input.expected_disbursement_date,
      submitted_on_date: input.expected_disbursement_date,
      approved_on_date:
        input.action === "approve" || funded
          ? input.expected_disbursement_date
          : null,
      withdrawn_on_date: input.action === "withdraw" ? input.date : null,
      actual_disbursement_date: funded ? input.date : null,
      principal_disbursed_minor: funded
        ? input.quote.schedule.principal_minor
        : null,
      principal_outstanding_minor: funded
        ? input.quote.schedule.principal_minor
        : null,
      outstanding_minor: funded ? input.quote.schedule.repayment_minor : null,
      schedule: funded ? input.quote.schedule : null,
      disbursements: funded
        ? [
            {
              id: 81,
              external_id: input.transaction_external_id ?? null,
              date: input.date,
              amount_minor: input.quote.schedule.principal_minor,
              reversed: false,
              transfer,
            },
          ]
        : [],
    },
    transaction_id: funded ? 81 : null,
    transfer_id: funded ? 91 : null,
  };
};
