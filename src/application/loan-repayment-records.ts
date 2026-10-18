import { Effect, Schema } from "effect";
import {
  BankingError,
  bankingDate,
  RoleSchema,
  type Session,
} from "../domain/banking";
import {
  RepaymentCommand,
  RepaymentDetail,
  RepaymentEvent,
  RepaymentOperation,
  RepaymentRecord,
  RepaymentRequest,
  repaymentActions,
} from "../domain/loan-repayment-workflow";
import {
  LoanRepaymentInstruction,
  type LoanRepaymentOffer,
  LoanRepaymentResult,
  validateRepaymentInstruction,
  validateRepaymentOffer,
} from "../domain/loan-repayments";
import { Store } from "../domain/ports";
import {
  loanContext,
  loanFailure,
  loanNow,
  readLoanValue,
  savedLoanDetail,
} from "./loan-records";

export const repaymentUnknown = () =>
  new BankingError({
    message:
      "The original repayment acknowledgement is unavailable. Inspect its saved reference; do not send another Core instruction.",
    status: 503,
    uncertain: true,
  });
export const repaymentInput = <A, I>(
  schema: Schema.Schema<A, I>,
  input: unknown,
) =>
  Schema.decodeUnknown(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Choose valid original repayment fields and an explicit reviewed decision.",
          status: 400,
        }),
    ),
  );
const repaymentKey = (key: string) =>
  /^[a-zA-Z0-9_-]{8,100}$/.test(key)
    ? Effect.void
    : loanFailure("A stable original repayment reference is required.", 400);
const sameOfferLoan = (session: Session, offer: LoanRepaymentOffer) =>
  Effect.gen(function* () {
    const context = yield* loanContext(session, offer.loan_id);
    if (
      offer.owner.bank_id !== session.bank_id ||
      offer.core_id !== context.loan.core_id ||
      offer.owner.savings_account_id !== context.owner.savings_account_id ||
      offer.owner.client_id !== context.owner.client_id ||
      offer.owner.product_id !== context.owner.product_id ||
      offer.expected_disbursement_date !==
        context.quote.expected_disbursement_date ||
      JSON.stringify(offer.terms) !== JSON.stringify(context.quote.terms)
    )
      return yield* loanFailure(
        "The saved repayment offer does not match this owned original loan.",
        503,
      );
    return context;
  });
export const ownedRepaymentOffer = (session: Session, id: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one<{ offer_json: string }>(
      "SELECT offer_json FROM loan_repayment_offers WHERE id=? AND bank_id=?",
      id,
      session.bank_id,
    );
    if (!row)
      return yield* loanFailure(
        "Owned repayment offer not found. Review a new offer.",
        404,
      );
    const value = yield* readLoanValue(
      Schema.parseJson(LoanRepaymentInstruction.fields.offer),
      row.offer_json,
    );
    const offer = yield* validateRepaymentOffer(value);
    if (offer.id !== id)
      return yield* loanFailure(
        "The original repayment offer identity could not be verified.",
        503,
      );
    yield* sameOfferLoan(session, offer);
    return offer;
  });
const repaymentContext = (session: Session, id: string) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one(
      "SELECT * FROM loan_repayment_requests WHERE id=? AND bank_id=?",
      id,
      session.bank_id,
    );
    if (!row) return yield* loanFailure("Repayment request not found.", 404);
    const repayment = yield* readLoanValue(RepaymentRecord, row);
    const offer = yield* ownedRepaymentOffer(session, repayment.offer_id);
    if (
      repayment.loan_id !== offer.loan_id ||
      repayment.account_id !== offer.owner.savings_account_id ||
      repayment.consented_at < offer.quoted_at ||
      repayment.consented_at >= offer.expires_at ||
      bankingDate(repayment.consented_at) !== offer.payment_date
    )
      return yield* loanFailure(
        "The original repayment consent and owned loan could not be verified.",
        503,
      );
    return { repayment, offer };
  });
const KeyRecord = Schema.Struct({
  request_id: RepaymentRecord.fields.id,
  actor: RoleSchema,
  request_json: Schema.parseJson(RepaymentRequest),
  operation_id: Schema.NullOr(RepaymentOperation.fields.id),
});
const repaymentKeyRecord = (session: Session, key: string) =>
  Effect.gen(function* () {
    yield* repaymentKey(key);
    const row = yield* (yield* Store).one(
      "SELECT request_id,actor,request_json,operation_id FROM loan_repayment_events WHERE bank_id=? AND command_key=?",
      session.bank_id,
      key,
    );
    return row ? yield* readLoanValue(KeyRecord, row) : null;
  });
export const replayRepayment = (
  session: Session,
  key: string,
  request: typeof RepaymentRequest.Type,
) =>
  Effect.gen(function* () {
    const record = yield* repaymentKeyRecord(session, key);
    if (
      record &&
      (record.actor !== session.role ||
        JSON.stringify(record.request_json) !== JSON.stringify(request))
    )
      return yield* loanFailure(
        "This reference belongs to another original repayment instruction or role. Inspect its saved history.",
      );
    return record;
  });
export const originalRepaymentOperation = (
  session: Session,
  requestId: string,
  id: string | null = null,
) =>
  Effect.gen(function* () {
    const row = yield* (yield* Store).one(
      `SELECT *,client_key AS key,result_json AS result FROM loan_repayment_operations WHERE request_id=? AND bank_id=?${id ? " AND id=?" : ""} ORDER BY rowid DESC LIMIT 1`,
      requestId,
      session.bank_id,
      ...(id ? [id] : []),
    );
    if (!row) return null;
    const value = yield* readLoanValue(
      Schema.Struct({
        ...RepaymentOperation.fields,
        result: Schema.NullOr(Schema.parseJson(LoanRepaymentResult)),
        command_json: Schema.parseJson(LoanRepaymentInstruction),
        request_json: Schema.parseJson(RepaymentCommand),
        original_version: RepaymentRecord.fields.version,
      }),
      row,
    );
    const original = yield* validateRepaymentInstruction(
      value.command_json,
      yield* loanNow,
      "confirm",
    );
    const { repayment, offer } = yield* repaymentContext(session, requestId);
    if (
      original.operation_id !== value.id ||
      original.consented_at !== repayment.consented_at ||
      JSON.stringify(original.offer) !== JSON.stringify(offer) ||
      value.request_json.id !== requestId ||
      value.request_json.version !== value.original_version ||
      value.request_json.action !== "pay" ||
      value.request_json.note !== original.note ||
      (value.status === "confirmed"
        ? value.result === null
        : value.result !== null) ||
      (value.result !== null &&
        (value.result.operation_id !== value.id ||
          value.result.amount_minor !== offer.amount_minor ||
          value.result.date !== offer.payment_date ||
          value.result.loan.id !== offer.core_id ||
          value.result.loan.external_id !== offer.external_id ||
          JSON.stringify(value.result.loan.owner) !==
            JSON.stringify(offer.owner)))
    )
      return yield* loanFailure(
        "The saved repayment operation does not match its immutable authorization.",
        503,
      );
    return value;
  });
export const savedRepaymentDetail = (
  session: Session,
  id: string,
  key: string | null = null,
) =>
  Effect.gen(function* () {
    const { repayment, offer } = yield* repaymentContext(session, id);
    const store = yield* Store;
    const operation = yield* originalRepaymentOperation(session, id);
    const rows = yield* store.all(
      "SELECT id,actor,action,kind,note,status,operation_status,version,created_at FROM loan_repayment_events WHERE request_id=? AND bank_id=? ORDER BY version",
      id,
      session.bank_id,
    );
    const history = yield* Effect.forEach(rows, (row) =>
      readLoanValue(RepaymentEvent, row),
    );
    if (
      history.length !== repayment.version + 1 ||
      history.at(-1)?.version !== repayment.version
    )
      return yield* loanFailure(
        "This repayment changed while loading. Refresh its saved history.",
      );
    const accountClaim = yield* store.one(
      "SELECT id FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain') LIMIT 1",
      session.bank_id,
      repayment.account_id,
    );
    const pending =
      operation?.status === "executing" || operation?.status === "uncertain";
    const now = yield* loanNow;
    const actions = repaymentActions(
      repayment,
      offer,
      session.role,
      pending,
      !!accountClaim,
      now,
    );
    const recorded = key ? yield* repaymentKeyRecord(session, key) : null;
    if (key && (!recorded || recorded.request_id !== id))
      return yield* Effect.fail(repaymentUnknown());
    const recordedOperation = recorded?.operation_id
      ? yield* originalRepaymentOperation(session, id, recorded.operation_id)
      : null;
    if (
      recorded?.operation_id &&
      (!recordedOperation ||
        recordedOperation.key !== key ||
        recordedOperation.actor !== recorded.actor ||
        JSON.stringify(recordedOperation.request_json) !==
          JSON.stringify(recorded.request_json))
    )
      return yield* loanFailure(
        "The original repayment receipt could not be corroborated.",
        503,
      );
    const loan = yield* savedLoanDetail(session, repayment.loan_id);
    return yield* readLoanValue(RepaymentDetail, {
      repayment,
      offer,
      core: loan.core,
      operation,
      history,
      actions,
      unavailable_reason: pending
        ? "Inspect the original repayment; its Core outcome is unconfirmed. Do not send it again."
        : accountClaim
          ? "Another original account instruction needs confirmation before payment."
          : (repayment.status === "submitted" ||
                repayment.status === "recommended") &&
              (now >= offer.expires_at ||
                bankingDate(now) !== offer.payment_date)
            ? "The offer expired. Cancel or reject this request before reviewing a new offer."
            : null,
      financial_view_stale: loan.financial_view_stale,
      recorded_key: key,
      recorded_actor: recorded?.actor ?? null,
      recorded_request: recorded?.request_json ?? null,
      recorded_operation: recordedOperation,
    });
  });
export const savedRepaymentForKey = (session: Session, key: string) =>
  Effect.gen(function* () {
    const record = yield* repaymentKeyRecord(session, key);
    if (!record)
      return yield* loanFailure(
        "No original repayment is recorded with this reference yet. Check again; do not send another Core instruction.",
        404,
        true,
      );
    return yield* savedRepaymentDetail(session, record.request_id, key);
  });
export const listRepayments = (session: Session, loanId: string) =>
  Effect.gen(function* () {
    yield* loanContext(session, loanId);
    const rows = yield* (yield* Store).all<{ id: string }>(
      "SELECT id FROM loan_repayment_requests WHERE bank_id=? AND loan_id=? ORDER BY rowid DESC",
      session.bank_id,
      loanId,
    );
    return {
      repayments: yield* Effect.forEach(
        rows,
        (row) => savedRepaymentDetail(session, row.id),
        { concurrency: 3 },
      ),
    };
  });
export const persistRepaymentOutcome = (
  session: Session,
  operation: Pick<RepaymentOperation, "id" | "status" | "version">,
  status: "confirmed" | "uncertain" | "failed",
  result: LoanRepaymentResult | null = null,
) =>
  Effect.gen(function* () {
    const proof =
      result === null
        ? null
        : yield* readLoanValue(LoanRepaymentResult, result);
    const now = yield* loanNow;
    const changes = yield* (yield* Store).run(
      "UPDATE loan_repayment_operations SET status=?,version=version+1,result_json=?,error=?,observed_at=?,updated_at=? WHERE id=? AND bank_id=? AND status=? AND version=?",
      status,
      proof === null ? null : JSON.stringify(proof),
      status === "confirmed"
        ? null
        : status === "uncertain"
          ? "Original Core repayment remains unconfirmed. Inspect it; do not repeat the write."
          : "This original attempt was not dispatched or was definitely rejected. Review its saved history.",
      now,
      new Date(now).toISOString(),
      operation.id,
      session.bank_id,
      operation.status,
      operation.version,
    );
    if (!Number.isSafeInteger(changes) || changes < 1)
      return yield* Effect.fail(repaymentUnknown());
  }).pipe(Effect.mapError(repaymentUnknown));
