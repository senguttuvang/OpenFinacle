import { Schema } from "effect";
import { RoleSchema } from "./banking";
import { LoanRepaymentOperationId } from "./loan-repayment-identity";
import {
  RepaymentCommand,
  RepaymentDetail,
  RepaymentPreview,
  RepaymentQuoteInput,
  RepaymentSubmission,
} from "./loan-repayment-workflow";

const key = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/));
export const RepaymentPilotCommand = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("list"),
    role: RoleSchema,
    loan_id: LoanRepaymentOperationId,
  }),
  Schema.Struct({
    kind: Schema.Literal("detail", "inspect"),
    role: RoleSchema,
    id: LoanRepaymentOperationId,
  }),
  Schema.Struct({ kind: Schema.Literal("reference"), role: RoleSchema, key }),
  Schema.Struct({
    kind: Schema.Literal("quote"),
    role: RoleSchema,
    input: RepaymentQuoteInput,
  }),
  Schema.Struct({
    kind: Schema.Literal("submit"),
    role: RoleSchema,
    submission: RepaymentSubmission,
    key,
  }),
  Schema.Struct({
    kind: Schema.Literal("action"),
    role: RoleSchema,
    command: RepaymentCommand,
    key,
  }),
);
export type RepaymentPilotCommand = typeof RepaymentPilotCommand.Type;
export const RepaymentPilotResponse = Schema.Union(
  RepaymentPreview,
  RepaymentDetail,
  Schema.Struct({ repayments: Schema.Array(RepaymentDetail) }),
);
export type RepaymentPilotResponse = typeof RepaymentPilotResponse.Type;
