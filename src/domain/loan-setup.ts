import { Schema } from "effect";
import { LoanSetupStep, loanLedgerDefinitions } from "./loan-product";

export const loanSetupSteps: readonly LoanSetupStep[] = [
  ...loanLedgerDefinitions.map(({ code }) => ({
    kind: "account" as const,
    code,
  })),
  { kind: "product" },
];
export const loanSetupStepId = (step: LoanSetupStep) =>
  step.kind === "product" ? "product" : step.code;
export const LoanSetupCommand = Schema.Struct({
  step: LoanSetupStep,
  key: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
  version: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});
export type LoanSetupCommand = typeof LoanSetupCommand.Type;
const Event = Schema.Struct({
  step: LoanSetupStep,
  key: LoanSetupCommand.fields.key,
  status: Schema.Literal("executing", "uncertain", "failed", "confirmed"),
  resource_id: Schema.NullOr(
    Schema.Number.pipe(Schema.int(), Schema.positive()),
  ),
  at: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  message: Schema.String,
});
export type LoanSetupEvent = typeof Event.Type;
export const LoanSetupState = Schema.Struct({
  version: LoanSetupCommand.fields.version,
  events: Schema.Array(Event).pipe(Schema.maxItems(120)),
});
export type LoanSetupState = typeof LoanSetupState.Type;
export const loanSetupNext = (state: LoanSetupState) =>
  loanSetupSteps.find(
    (step) =>
      state.events.findLast(
        (event) => loanSetupStepId(event.step) === loanSetupStepId(step),
      )?.status !== "confirmed",
  ) ?? null;
export const loanSetupPending = (state: LoanSetupState) => {
  const last = state.events.at(-1);
  return last?.status === "executing" || last?.status === "uncertain"
    ? last
    : null;
};
