import type { CoreLoanSnapshot } from "../../src/domain/loan-engine";
import type { LoanStatement } from "../../src/domain/loan-statements";

// Invented saved-view example. Actual Core statement proof is separate.
export const inventedLoanStatement = (
  loan: CoreLoanSnapshot,
): LoanStatement => {
  if (
    loan.status !== "active" ||
    loan.principal_outstanding_minor === null ||
    loan.outstanding_minor === null ||
    !loan.actual_disbursement_date
  )
    throw new Error("Statement fixture requires an active funded loan");
  return {
    coverage: "core-customer-transactions",
    principal_paid_minor: 0,
    interest_paid_minor: 0,
    repayment_minor: 0,
    principal_outstanding_minor: loan.principal_outstanding_minor,
    interest_outstanding_minor:
      loan.outstanding_minor - loan.principal_outstanding_minor,
    outstanding_minor: loan.outstanding_minor,
    transactions: [
      {
        id: loan.disbursements[0].id,
        type_id: 1,
        date: loan.actual_disbursement_date,
        amount_minor: loan.principal_minor,
        principal_minor: 0,
        interest_minor: 0,
        fees_minor: 0,
        penalties_minor: 0,
        overpayment_minor: 0,
        unrecognized_income_minor: 0,
        manually_reversed: false,
        reversed_on_date: null,
      },
    ],
  };
};
