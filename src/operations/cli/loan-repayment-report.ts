import { Effect, Schema } from "effect";
import type { Role } from "../../platform/banking-workspace/domain/banking";
import {
  RepaymentPilotCommand,
  RepaymentPilotResponse,
} from "../../platform/lending/domain/repayments/loan-repayment-pilot";

export const repaymentPilotActions = [
  "status",
  "quote",
  "submit",
  "recommend",
  "pay",
  "reject",
  "cancel",
  "inspect",
] as const;
interface PilotOptions {
  action: (typeof repaymentPilotActions)[number];
  role: Role;
  loanId: string;
  id: string;
  offerId: string;
  key: string;
  version: number;
  amountMinor: number;
  note: string;
  accept: boolean;
}
const fieldsError = () =>
  new Error(
    "Review the repayment pilot fields: choose an explicit --loan-id, --request-id or original --key for status; quote requires --loan-id and integer --amount-minor; submission requires --offer-id, --accept-offer and --key; decisions require the correct --role, --request-id, --request-version, --note and --key. No request was sent.",
  );
export const buildRepaymentPilotCommand = (o: PilotOptions) =>
  Effect.gen(function* () {
    let command: RepaymentPilotCommand;
    if (o.action === "status") {
      if (
        [o.loanId, o.id, o.key].filter(Boolean).length !== 1 ||
        o.offerId ||
        o.version !== -1 ||
        o.amountMinor !== -1 ||
        o.accept ||
        o.note
      )
        return yield* Effect.fail(fieldsError());
      command = o.loanId
        ? { kind: "list", role: o.role, loan_id: o.loanId }
        : o.id
          ? { kind: "detail", role: o.role, id: o.id }
          : { kind: "reference", role: o.role, key: o.key };
    } else if (o.action === "quote") {
      if (
        o.role !== "customer" ||
        !o.loanId ||
        o.id ||
        o.key ||
        o.offerId ||
        o.version !== -1 ||
        o.accept ||
        o.note ||
        o.amountMinor < 0
      )
        return yield* Effect.fail(fieldsError());
      command = {
        kind: "quote",
        role: o.role,
        input: { loan_id: o.loanId, amount_minor: o.amountMinor },
      };
    } else if (o.action === "submit") {
      if (
        o.role !== "customer" ||
        !o.offerId ||
        !o.key ||
        !o.accept ||
        o.loanId ||
        o.id ||
        o.version !== -1 ||
        o.amountMinor !== -1 ||
        o.note
      )
        return yield* Effect.fail(fieldsError());
      command = {
        kind: "submit",
        role: o.role,
        submission: { offer_id: o.offerId, consent: true },
        key: o.key,
      };
    } else if (o.action === "inspect") {
      if (
        o.role !== "approver" ||
        !o.id ||
        o.loanId ||
        o.key ||
        o.offerId ||
        o.version !== -1 ||
        o.amountMinor !== -1 ||
        o.accept ||
        o.note
      )
        return yield* Effect.fail(fieldsError());
      command = { kind: "inspect", role: o.role, id: o.id };
    } else {
      const allowed = repaymentDecisionRoleAllowed(o);
      if (
        !allowed ||
        !o.id ||
        !o.key ||
        o.version < 0 ||
        o.loanId ||
        o.offerId ||
        o.amountMinor !== -1 ||
        o.accept ||
        o.note.trim().length < 5
      )
        return yield* Effect.fail(fieldsError());
      command = {
        kind: "action",
        role: o.role,
        command: {
          id: o.id,
          version: o.version,
          action: o.action,
          note: o.note.trim(),
        },
        key: o.key,
      };
    }
    return yield* Schema.decodeUnknown(RepaymentPilotCommand, {
      onExcessProperty: "error",
    })(command).pipe(Effect.mapError(fieldsError));
  });
const responseError = () =>
  new Error(
    "The repayment response does not corroborate this original pilot instruction. Inspect its saved reference; no request was retried.",
  );
export const verifyRepaymentPilotResponse = (
  command: RepaymentPilotCommand,
  input: unknown,
) =>
  Effect.gen(function* () {
    const value = yield* Schema.decodeUnknown(RepaymentPilotResponse)(
      input,
    ).pipe(Effect.mapError(responseError));
    if (command.kind === "quote") {
      if (
        !("request_created" in value) ||
        value.offer.loan_id !== command.input.loan_id ||
        value.offer.amount_minor !== command.input.amount_minor
      )
        return yield* Effect.fail(responseError());
    } else if (command.kind === "list") {
      if (
        !("repayments" in value) ||
        value.repayments.some(
          (d) =>
            d.repayment.loan_id !== command.loan_id ||
            d.offer.loan_id !== command.loan_id,
        )
      )
        return yield* Effect.fail(responseError());
    } else {
      if (!("repayment" in value)) return yield* Effect.fail(responseError());
      if (
        (command.kind === "detail" || command.kind === "inspect") &&
        value.repayment.id !== command.id
      )
        return yield* Effect.fail(responseError());
      if (command.kind === "reference" && value.recorded_key !== command.key)
        return yield* Effect.fail(responseError());
      if (command.kind === "submit" || command.kind === "action") {
        const request =
          command.kind === "submit" ? command.submission : command.command;
        if (
          value.recorded_key !== command.key ||
          value.recorded_actor !== command.role ||
          JSON.stringify(value.recorded_request) !== JSON.stringify(request) ||
          (command.kind === "submit"
            ? value.offer.id !== command.submission.offer_id
            : value.repayment.id !== command.command.id)
        )
          return yield* Effect.fail(responseError());
        if (
          command.kind === "action" &&
          command.command.action === "pay" &&
          (!value.recorded_operation ||
            value.recorded_operation.key !== command.key ||
            value.recorded_operation.actor !== "approver")
        )
          return yield* Effect.fail(responseError());
      }
    }
    return value;
  });
export const repaymentPilotReport = (
  value: RepaymentPilotResponse,
): unknown => {
  if ("request_created" in value)
    return {
      source: value.source,
      loan_id: value.offer.loan_id,
      offer_id: value.offer.id,
      amount_minor: value.offer.amount_minor,
      date: value.offer.payment_date,
      expires_at: value.offer.expires_at,
      available_minor: value.offer.available_minor,
      principal_outstanding_minor: value.offer.principal_outstanding_minor,
      outstanding_minor: value.offer.outstanding_minor,
      request_created: false,
      financial_posted: false,
    };
  if ("repayments" in value)
    return { repayments: value.repayments.map(repaymentPilotReport) };
  const operation = (op: typeof value.operation) =>
    op
      ? {
          id: op.id,
          key: op.key,
          actor: op.actor,
          status: op.status,
          version: op.version,
          result: op.result
            ? {
                operation_id: op.result.operation_id,
                loan_id: op.result.loan.id,
                loan_transaction_id: op.result.loan_transaction_id,
                savings_transaction_id: op.result.savings_transaction_id,
                transfer_id: op.result.transfer_id,
                amount_minor: op.result.amount_minor,
                principal_minor: op.result.principal_minor,
                interest_minor: op.result.interest_minor,
                date: op.result.date,
              }
            : null,
        }
      : null;
  return {
    request_id: value.repayment.id,
    loan_id: value.repayment.loan_id,
    offer_id: value.offer.id,
    origin: value.repayment.origin,
    status: value.repayment.status,
    version: value.repayment.version,
    history_events: value.history.length,
    amount_minor: value.offer.amount_minor,
    recorded_key: value.recorded_key,
    recorded_actor: value.recorded_actor,
    original_operation: operation(value.recorded_operation),
    latest_operation: operation(value.operation),
    available_actions: value.actions,
    financial_view_stale: value.financial_view_stale,
    core: value.core
      ? {
          id: value.core.snapshot.id,
          status: value.core.snapshot.status,
          stale: value.core.stale,
          synced_at: value.core.synced_at,
          principal_outstanding_minor:
            value.core.snapshot.principal_outstanding_minor,
          outstanding_minor: value.core.snapshot.outstanding_minor,
          principal_paid_minor:
            value.core.snapshot.statement?.principal_paid_minor,
          interest_paid_minor:
            value.core.snapshot.statement?.interest_paid_minor,
          repayment_minor: value.core.snapshot.statement?.repayment_minor,
        }
      : null,
  };
};

const repaymentDecisionRoleAllowed = (o: PilotOptions) =>
  o.action === "recommend"
    ? o.role === "officer"
    : o.action === "cancel"
      ? o.role === "customer"
      : o.action === "pay"
        ? o.role === "approver"
        : o.role === "officer" || o.role === "approver";
