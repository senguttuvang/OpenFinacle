import { Schema } from "effect";

export const LoanRepaymentOperationId = Schema.String.pipe(
  Schema.pattern(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  ),
);
export const LoanRepaymentMarker = Schema.String.pipe(
  Schema.pattern(
    /^of-loan-repay-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  ),
);
export const loanRepaymentMarker = (id: string) => `of-loan-repay-${id}`;
export const loanRepaymentCoreKey = (id: string) => `of-loan-repay-op-${id}`;
