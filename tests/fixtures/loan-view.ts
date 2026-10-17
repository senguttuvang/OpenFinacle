import { bankingDate } from "../../src/domain/banking";
import type { LoanDetail } from "../../src/domain/loan-workflow";
import { workflowQuote, workflowQuotedAt } from "./loan-workflow";

// Independently invented view data. Running-Core evidence is recorded separately.
export const loanView = (
  bankId = "loan-test-bank",
  now = workflowQuotedAt,
): LoanDetail => {
  const day = bankingDate(now);
  const [year, month, date] = day.split("-").map(Number);
  const quote = {
    ...structuredClone(workflowQuote),
    bank_id: bankId,
    expected_disbursement_date: day,
    quoted_at: now,
    expires_at: now + 900000,
    schedule: {
      ...structuredClone(workflowQuote.schedule),
      installments: workflowQuote.schedule.installments.map((row) => ({
        ...row,
        due_date: new Date(Date.UTC(year, month - 1 + row.period, date))
          .toISOString()
          .slice(0, 10),
      })),
    },
  };
  return {
    loan: {
      id: "b60427be-942d-45f5-b19a-36b855babbc3",
      bank_id: bankId,
      quote_id: quote.id,
      terms: quote.terms,
      status: "submitted",
      maker: null,
      checker: null,
      core_id: null,
      withdrawal_requested: false,
      version: 0,
      origin: "customer",
      accepted_at: now + 1,
      created_at: new Date(now + 1).toISOString(),
      updated_at: new Date(now + 1).toISOString(),
    },
    quote,
    core: null,
    operation: null,
    history: [
      {
        id: "invented-submit-event",
        actor: "customer",
        action: "submit",
        kind: "decision",
        note: "Accepted independently invented terms.",
        status: "submitted",
        operation_status: null,
        version: 0,
        created_at: new Date(now + 1).toISOString(),
      },
    ],
    actions: ["cancel"],
    unavailable_reason: null,
    financial_view_stale: false,
    recorded_key: null,
    recorded_actor: null,
    recorded_request: null,
    recorded_operation: null,
  };
};
