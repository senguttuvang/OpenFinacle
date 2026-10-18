import { Schema } from "effect";
import { RoleSchema } from "../../../banking-workspace/domain/banking";
import {
  LoanApplication,
  LoanDetail,
  LoanQuotePreview,
  LoanSubmission,
} from "./loan-workflow";
import { LoanCommand, LoanTerms } from "./loans";

const id = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/));
export const LoanPilotCommand = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("list"), role: RoleSchema }),
  Schema.Struct({
    kind: Schema.Literal("detail", "inspect", "refresh"),
    role: RoleSchema,
    id,
  }),
  Schema.Struct({
    kind: Schema.Literal("reference"),
    role: RoleSchema,
    key: id,
  }),
  Schema.Struct({
    kind: Schema.Literal("quote"),
    role: RoleSchema,
    terms: LoanTerms,
  }),
  Schema.Struct({
    kind: Schema.Literal("submit"),
    role: RoleSchema,
    submission: LoanSubmission,
    key: id,
  }),
  Schema.Struct({
    kind: Schema.Literal("action"),
    role: RoleSchema,
    command: LoanCommand,
    key: id,
  }),
);
export type LoanPilotCommand = typeof LoanPilotCommand.Type;
export const LoanPilotResponse = Schema.Union(
  LoanQuotePreview,
  LoanDetail,
  Schema.Struct({ loans: Schema.Array(LoanApplication) }),
);
export type LoanPilotResponse = typeof LoanPilotResponse.Type;
