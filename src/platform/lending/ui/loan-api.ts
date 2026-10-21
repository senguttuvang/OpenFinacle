import { Effect, Schema } from "effect";
import {
  BankingError,
  RoleSchema,
} from "../../banking-workspace/domain/banking";
import { api } from "../../banking-workspace/ui/api";
import {
  LoanApplication,
  LoanDetail,
  LoanQuotePreview,
  LoanSubmission,
} from "../domain/origination/loan-workflow";
import { LoanCommand, type LoanTerms } from "../domain/origination/loans";

export const LoanPending = Schema.Struct({
  key: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{8,100}$/)),
  role: RoleSchema,
  instruction: Schema.Union(
    Schema.Struct({ kind: Schema.Literal("submit"), input: LoanSubmission }),
    Schema.Struct({ kind: Schema.Literal("action"), input: LoanCommand }),
  ),
});
export type LoanPending = typeof LoanPending.Type;
export const loanResponseError = () =>
  new BankingError({
    message:
      "The loan response could not be verified. Check the original instruction status before another decision.",
    status: 503,
    uncertain: true,
  });
export const loanStorageError = () =>
  new BankingError({
    message:
      "The original loan instruction could not be stored or read. Restore browser storage before sending another instruction.",
    status: 503,
  });
export const loanListApi = (bankId: string) =>
  api<unknown>("/loans").pipe(
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.Struct({ loans: Schema.Array(LoanApplication) }),
      ),
    ),
    Effect.mapError(loanResponseError),
    Effect.flatMap((result) =>
      result.loans.every((loan) => loan.bank_id === bankId)
        ? Effect.succeed(result.loans)
        : Effect.fail(loanResponseError()),
    ),
  );
export const ownedLoanDetail = (result: LoanDetail, bankId: string) =>
  result.loan.bank_id === bankId &&
  result.quote.bank_id === bankId &&
  result.loan.quote_id === result.quote.id &&
  JSON.stringify(result.loan.terms) === JSON.stringify(result.quote.terms) &&
  result.history.length === result.loan.version + 1 &&
  result.history.every((event, index) => event.version === index) &&
  result.history.at(-1)?.status === result.loan.status &&
  (!result.core ||
    (result.core.snapshot.id === result.loan.core_id &&
      result.core.snapshot.owner.bank_id === bankId &&
      result.core.snapshot.owner.client_id === result.quote.client_id &&
      result.core.snapshot.owner.savings_account_id ===
        result.quote.savings_account_id &&
      result.core.snapshot.owner.product_id === result.quote.product_id &&
      result.core.snapshot.principal_minor ===
        result.quote.schedule.principal_minor &&
      result.core.snapshot.expected_disbursement_date ===
        result.quote.expected_disbursement_date));
export const loanDetailApi = (
  bankId: string,
  path: string,
  body?: unknown,
  key?: string,
) =>
  api<unknown>(path, body, key).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknown(LoanDetail)(value).pipe(
        Effect.mapError(loanResponseError),
      ),
    ),
    Effect.flatMap((result) =>
      ownedLoanDetail(result, bankId)
        ? Effect.succeed(result)
        : Effect.fail(loanResponseError()),
    ),
  );
export const loanQuoteApi = (bankId: string, terms: LoanTerms) =>
  api<unknown>("/loans/quote", terms).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknown(LoanQuotePreview)(value).pipe(
        Effect.mapError(loanResponseError),
      ),
    ),
    Effect.flatMap((result) =>
      result.quote.bank_id === bankId &&
      JSON.stringify(result.quote.terms) === JSON.stringify(terms)
        ? Effect.succeed(result)
        : Effect.fail(loanResponseError()),
    ),
  );
const requestValue = (input: LoanPending["instruction"]["input"]) =>
  "quote_id" in input
    ? { quote_id: input.quote_id, consent: input.consent }
    : {
        id: input.id,
        version: input.version,
        action: input.action,
        note: input.note.trim(),
      };
const coreActions = new Set([
  "register",
  "approve",
  "disburse",
  "undo_approval",
  "withdraw",
]);
export const verifiedLoanReceipt = (
  result: LoanDetail,
  original: LoanPending,
) => {
  const request = original.instruction.input;
  if (
    result.recorded_key !== original.key ||
    result.recorded_actor !== original.role ||
    !result.recorded_request ||
    JSON.stringify(requestValue(result.recorded_request)) !==
      JSON.stringify(requestValue(request))
  )
    return false;
  if (
    original.instruction.kind === "submit" &&
    result.loan.quote_id !== original.instruction.input.quote_id
  )
    return false;
  if (
    original.instruction.kind === "action" &&
    result.loan.id !== original.instruction.input.id
  )
    return false;
  if ("action" in request && coreActions.has(request.action))
    return (
      result.recorded_operation?.key === original.key &&
      result.recorded_operation.actor === original.role &&
      result.recorded_operation.action === request.action
    );
  return result.recorded_operation === null;
};
export const unresolvedLoanOriginal = (result: LoanDetail) =>
  result.recorded_operation?.status === "executing" ||
  result.recorded_operation?.status === "uncertain";
export const repeatableLoanDraft = (original: LoanPending) =>
  original.instruction.kind === "submit" ||
  !coreActions.has(original.instruction.input.action);
export const loanActionLabel: Record<LoanCommand["action"], string> = {
  cancel: "Cancel application",
  recommend: "Recommend application",
  reject: "Reject application",
  register: "Register in Core",
  approve: "Approve loan",
  disburse: "Disburse to savings",
  request_withdrawal: "Request withdrawal",
  undo_approval: "Undo approval",
  withdraw: "Withdraw in Core",
};
export const loanStatus = (status: string) =>
  ({
    submitted: "Submitted",
    recommended: "Recommended",
    registered: "Registered in Core",
    approved: "Approved · not funded",
    active: "Active",
    rejected: "Rejected",
    cancelled: "Cancelled",
    withdrawn: "Withdrawn",
  })[status] ?? status;
export const loanReference = (id: string) =>
  `LN-${id.slice(0, 8).toUpperCase()}`;
