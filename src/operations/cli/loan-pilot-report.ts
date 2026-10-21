import { Effect, Schema } from "effect";
import type { Role } from "../../platform/banking-workspace/domain/banking";
import {
  LoanPilotCommand,
  type LoanPilotResponse,
} from "../../platform/lending/domain/origination/loan-pilot";
import { safeLoanProofChecks } from "../../platform/lending/domain/origination/loan-workflow";
import type { LoanCommand } from "../../platform/lending/domain/origination/loans";

export const loanPilotActions = [
  "status",
  "quote",
  "submit",
  "recommend",
  "register",
  "approve",
  "disburse",
  "reject",
  "cancel",
  "request_withdrawal",
  "undo_approval",
  "withdraw",
  "inspect",
  "refresh",
] as const;
interface PilotOptions {
  action: (typeof loanPilotActions)[number];
  role: Role;
  id: string;
  quoteId: string;
  key: string;
  version: number;
  note: string;
  accept: boolean;
}
const fieldsError = () =>
  new Error(
    "Review the pilot action fields: explicit --role, --loan-id, --loan-version, --quote-id, --accept-quote and original --key as applicable. No request was sent.",
  );
export const buildLoanPilotCommand = (input: PilotOptions) =>
  Effect.gen(function* () {
    let command: LoanPilotCommand;
    if (input.action === "status") {
      if (
        (input.id && input.key) ||
        input.quoteId ||
        input.version >= 0 ||
        input.accept
      )
        return yield* Effect.fail(fieldsError());
      command = input.key
        ? { kind: "reference", role: input.role, key: input.key }
        : input.id
          ? { kind: "detail", role: input.role, id: input.id }
          : { kind: "list", role: input.role };
    } else if (input.action === "quote") {
      if (
        input.id ||
        input.quoteId ||
        input.key ||
        input.version >= 0 ||
        input.accept
      )
        return yield* Effect.fail(fieldsError());
      command = {
        kind: "quote",
        role: input.role,
        terms: {
          product: "core-personal",
          principal: 12000,
          months: 12,
          purpose: "education",
          monthly_income: 30000,
          monthly_commitments: 5000,
          monthly_expenses: 10000,
        },
      };
    } else if (input.action === "submit") {
      if (
        !input.quoteId ||
        !input.key ||
        !input.accept ||
        input.id ||
        input.version >= 0
      )
        return yield* Effect.fail(fieldsError());
      command = {
        kind: "submit",
        role: input.role,
        submission: { quote_id: input.quoteId, consent: true },
        key: input.key,
      };
    } else if (input.action === "inspect" || input.action === "refresh") {
      if (
        !input.id ||
        input.key ||
        input.quoteId ||
        input.version >= 0 ||
        input.accept
      )
        return yield* Effect.fail(fieldsError());
      command = { kind: input.action, role: input.role, id: input.id };
    } else {
      if (
        !input.id ||
        !input.key ||
        input.version < 0 ||
        input.quoteId ||
        input.accept
      )
        return yield* Effect.fail(fieldsError());
      const action: LoanCommand["action"] = input.action;
      command = {
        kind: "action",
        role: input.role,
        command: {
          id: input.id,
          version: input.version,
          action,
          note: input.note.trim(),
        },
        key: input.key,
      };
    }
    return yield* Schema.decodeUnknown(LoanPilotCommand, {
      onExcessProperty: "error",
    })(command).pipe(Effect.mapError(fieldsError));
  });
export const loanPilotReport = (value: LoanPilotResponse) => {
  if ("application_created" in value)
    return {
      source: value.source,
      quote_id: value.quote.id,
      date: value.quote.expected_disbursement_date,
      expires_at: value.quote.expires_at,
      principal_minor: value.quote.schedule.principal_minor,
      interest_minor: value.quote.schedule.interest_minor,
      repayment_minor: value.quote.schedule.repayment_minor,
      installments: value.quote.schedule.installments.length,
      within_declared_surplus: value.affordability.within_declared_surplus,
      application_created: false,
      financial_posted: false,
    };
  if ("loans" in value)
    return {
      loans: value.loans.map((loan) => ({
        id: loan.id,
        status: loan.status,
        version: loan.version,
        origin: loan.origin,
      })),
    };
  const summary = (operation: typeof value.operation) =>
    operation
      ? {
          id: operation.id,
          key: operation.key,
          action: operation.action,
          actor: operation.actor,
          status: operation.status,
          version: operation.version,
        }
      : null;
  const funded = value.core?.snapshot.disbursements[0];
  return {
    loan_id: value.loan.id,
    inspection_checks: safeLoanProofChecks(value.inspection_checks),
    quote_id: value.quote.id,
    origin: value.loan.origin,
    status: value.loan.status,
    version: value.loan.version,
    withdrawal_requested: value.loan.withdrawal_requested,
    history_events: value.history.length,
    recorded_key: value.recorded_key,
    recorded_actor: value.recorded_actor,
    original_operation: summary(value.recorded_operation),
    latest_operation: summary(value.operation),
    available_actions: value.actions,
    financial_view_stale: value.financial_view_stale,
    core_loan: value.core
      ? {
          source: value.core.source,
          id: value.core.snapshot.id,
          status: value.core.snapshot.status,
          synced_at: value.core.synced_at,
          stale: value.core.stale,
          principal_minor: value.core.snapshot.principal_minor,
          outstanding_minor: value.core.snapshot.outstanding_minor,
          installments:
            value.core.snapshot.schedule?.installments.length ?? null,
          disbursement: funded
            ? {
                transaction_id: funded.id,
                transfer_id: funded.transfer?.id ?? null,
                date: funded.date,
                amount_minor: funded.amount_minor,
              }
            : null,
        }
      : null,
  };
};
