import { Effect, Either } from "effect";
import { requiredBank } from "../../banking-workspace/application/banking";
import { financialView } from "../../banking-workspace/application/financial-view";
import {
  bankingDate,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import { CoreLoanSnapshot } from "../domain/origination/loan-engine";
import { loanRepaymentCoreKey } from "../domain/repayments/loan-repayment-identity";
import {
  RepaymentCommand,
  RepaymentPreview,
  RepaymentQuoteInput,
  type RepaymentRecord,
  RepaymentSubmission,
} from "../domain/repayments/loan-repayment-workflow";
import {
  LoanRepayer,
  validateRepaymentInstruction,
  validateRepaymentOffer,
} from "../domain/repayments/loan-repayments";
import {
  loanContext,
  loanFailure,
  loanNow,
  persistLoanCoreView,
  readLoanValue,
} from "./loan-records";
import {
  originalRepaymentOperation,
  ownedRepaymentOffer,
  persistRepaymentOutcome,
  repaymentInput,
  repaymentUnknown,
  replayRepayment,
  savedRepaymentDetail,
} from "./loan-repayment-records";
import { loanSetupInventory, loanSetupStatus } from "./loan-setup";

const preparedBank = (session: Session) =>
  Effect.gen(function* () {
    const bank = yield* requiredBank(session);
    if (
      bank.status !== "ready" ||
      bank.customer_account <= 0 ||
      bank.customer_client <= 0
    )
      return yield* loanFailure(
        "Open the owned savings relationship before a repayment.",
      );
    return bank;
  });
const product = Effect.gen(function* () {
  const setup = yield* loanSetupStatus();
  if (setup.pending !== null || setup.next !== null)
    return yield* loanFailure(
      "Loan references require operator verification before another payment.",
    );
  const inventory = yield* loanSetupInventory();
  if (inventory.product_id === null)
    return yield* loanFailure(
      "The configured repayment product could not be verified.",
      503,
    );
  return inventory.product_id;
});
const currentOffer = (
  offer: { quoted_at: number; expires_at: number; payment_date: string },
  now: number,
) =>
  now >= offer.quoted_at &&
  now < offer.expires_at &&
  bankingDate(now) === offer.payment_date
    ? Effect.void
    : loanFailure(
        "The repayment offer expired. Cancel this request and review a new offer.",
      );
const receipt = (session: Session, id: string, key: string) =>
  savedRepaymentDetail(session, id, key).pipe(
    Effect.mapError(repaymentUnknown),
  );
export const createRepaymentOffer = (session: Session, input: unknown) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* loanFailure(
        "The customer must request and review repayment terms.",
        403,
      );
    const request = yield* repaymentInput(RepaymentQuoteInput, input);
    const bank = yield* preparedBank(session);
    const context = yield* loanContext(session, request.loan_id);
    if (
      context.loan.status !== "active" ||
      context.loan.core_id === null ||
      bank.customer_account !== context.owner.savings_account_id ||
      bank.customer_client !== context.owner.client_id
    )
      return yield* loanFailure(
        "Only this relationship's active supported loan can receive a partial payment.",
      );
    const store = yield* Store;
    const pending = yield* store.one(
      "SELECT id FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain') LIMIT 1",
      session.bank_id,
      bank.customer_account,
    );
    if ((yield* product) !== context.owner.product_id)
      return yield* loanFailure(
        "The active loan does not match the verified repayment product.",
      );
    if (pending)
      return yield* loanFailure(
        "Inspect the original account instruction before reviewing another payment.",
      );
    const lookup = {
      loan_id: context.loan.id,
      core_id: context.loan.core_id,
      external_id: `of-loan-${context.loan.id}`,
      owner: context.owner,
      terms: context.quote.terms,
      expected_disbursement_date: context.quote.expected_disbursement_date,
    };
    const quoted = yield* (yield* LoanRepayer).quote(
      lookup,
      request.amount_minor,
    );
    const offer = yield* validateRepaymentOffer(quoted.offer);
    const loan = yield* readLoanValue(CoreLoanSnapshot, quoted.loan);
    if (
      offer.loan_id !== lookup.loan_id ||
      offer.core_id !== lookup.core_id ||
      offer.external_id !== lookup.external_id ||
      JSON.stringify(offer.owner) !== JSON.stringify(lookup.owner) ||
      JSON.stringify(offer.terms) !== JSON.stringify(lookup.terms) ||
      offer.expected_disbursement_date !== lookup.expected_disbursement_date ||
      offer.amount_minor !== request.amount_minor ||
      loan.id !== lookup.core_id ||
      loan.external_id !== lookup.external_id ||
      JSON.stringify(loan.owner) !== JSON.stringify(lookup.owner) ||
      loan.status !== "active" ||
      loan.principal_minor !== context.quote.schedule.principal_minor ||
      loan.expected_disbursement_date !== lookup.expected_disbursement_date ||
      loan.principal_outstanding_minor !== offer.principal_outstanding_minor ||
      loan.outstanding_minor !== offer.outstanding_minor
    )
      return yield* loanFailure(
        "The Core repayment offer did not match the owned requested terms.",
        503,
      );
    yield* currentOffer(offer, yield* loanNow);
    yield* store.run(
      "INSERT INTO loan_repayment_offers(id,loan_id,bank_id,account_id,offer_json,quoted_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
      offer.id,
      offer.loan_id,
      session.bank_id,
      bank.customer_account,
      JSON.stringify(offer),
      offer.quoted_at,
      offer.expires_at,
      new Date(offer.quoted_at).toISOString(),
    );
    yield* persistLoanCoreView(offer.loan_id, loan);
    return yield* readLoanValue(RepaymentPreview, {
      source: "fineract",
      offer,
      request_created: false,
      financial_posted: false,
    });
  });
export const submitRepayment = (
  session: Session,
  input: unknown,
  key: string,
  origin: RepaymentRecord["origin"] = "customer",
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* loanFailure(
        "Only the customer can accept the original repayment offer.",
        403,
      );
    const parsed = yield* repaymentInput(RepaymentSubmission, input);
    const request = { offer_id: parsed.offer_id, consent: true as const };
    const replay = yield* replayRepayment(session, key, request);
    if (replay) return yield* receipt(session, replay.request_id, key);
    yield* preparedBank(session);
    const offer = yield* ownedRepaymentOffer(session, request.offer_id);
    const now = yield* loanNow;
    yield* currentOffer(offer, now);
    const id = crypto.randomUUID();
    const changes = yield* (yield* Store)
      .run(
        "INSERT INTO loan_repayment_events(id,request_id,loan_id,bank_id,offer_id,origin,consented_at,command_key,request_json,actor,action,kind,note,status,maker,checker,version,at_ms,created_at) SELECT ?,?,o.loan_id,o.bank_id,o.id,?,?,?,?,'customer','submit','decision','Customer accepted the immutable owned savings repayment offer.','submitted',NULL,NULL,0,?,? FROM loan_repayment_offers o WHERE o.id=? AND o.bank_id=? AND NOT EXISTS(SELECT 1 FROM loan_repayment_events WHERE bank_id=o.bank_id AND command_key=?) AND NOT EXISTS(SELECT 1 FROM loan_repayment_requests WHERE offer_id=o.id OR (loan_id=o.loan_id AND status IN ('submitted','recommended')))",
        crypto.randomUUID(),
        id,
        origin,
        now,
        key,
        JSON.stringify(request),
        now,
        new Date(now).toISOString(),
        offer.id,
        session.bank_id,
        key,
      )
      .pipe(Effect.mapError(repaymentUnknown));
    if (Number.isSafeInteger(changes) && changes > 0)
      return yield* receipt(session, id, key);
    const concurrent = yield* replayRepayment(session, key, request);
    if (concurrent) return yield* receipt(session, concurrent.request_id, key);
    return yield* loanFailure(
      "This offer was already accepted or a repayment is still pending. Inspect its saved history.",
    );
  });
export const actOnRepayment = (session: Session, input: unknown, key: string) =>
  Effect.gen(function* () {
    const parsed = yield* repaymentInput(RepaymentCommand, input);
    const request = {
      id: parsed.id,
      version: parsed.version,
      action: parsed.action,
      note: parsed.note.trim(),
    };
    if (request.note.length < 5)
      return yield* loanFailure(
        "Record the reviewed repayment reason before continuing.",
        400,
      );
    const replay = yield* replayRepayment(session, key, request);
    if (replay) return yield* receipt(session, replay.request_id, key);
    const permitted =
      session.role === "customer"
        ? request.action === "cancel"
        : session.role === "officer"
          ? request.action === "recommend" || request.action === "reject"
          : request.action === "pay" || request.action === "reject";
    if (!permitted)
      return yield* loanFailure(
        "This repayment decision requires its separate customer, officer or approver role.",
        403,
      );
    const before = yield* savedRepaymentDetail(session, request.id);
    if (before.repayment.version !== request.version)
      return yield* loanFailure(
        "This repayment changed. Refresh before another reviewed decision.",
      );
    if (!before.actions.includes(request.action))
      return yield* loanFailure(
        before.unavailable_reason ??
          "This repayment decision is unavailable in its current state.",
      );
    const now = yield* loanNow;
    const store = yield* Store;
    if (request.action !== "pay") {
      const next =
        request.action === "recommend"
          ? "recommended"
          : request.action === "cancel"
            ? "cancelled"
            : "rejected";
      const changes = yield* store
        .run(
          "INSERT INTO loan_repayment_events(id,request_id,loan_id,bank_id,offer_id,origin,consented_at,command_key,request_json,actor,action,kind,note,status,maker,checker,version,at_ms,created_at) SELECT ?,r.id,r.loan_id,r.bank_id,r.offer_id,r.origin,r.consented_at,?,?,?,?,'decision',?,?,?,r.checker,r.version+1,?,? FROM loan_repayment_requests r WHERE r.id=? AND r.bank_id=? AND r.version=? AND NOT EXISTS(SELECT 1 FROM loan_repayment_events WHERE bank_id=r.bank_id AND command_key=?) AND NOT EXISTS(SELECT 1 FROM loan_repayment_operations WHERE request_id=r.id AND status IN ('executing','uncertain'))",
          crypto.randomUUID(),
          key,
          JSON.stringify(request),
          session.role,
          request.action,
          request.note,
          next,
          request.action === "recommend" ? "officer" : before.repayment.maker,
          now,
          new Date(now).toISOString(),
          request.id,
          session.bank_id,
          request.version,
          key,
        )
        .pipe(Effect.mapError(repaymentUnknown));
      const recorded = yield* replayRepayment(session, key, request);
      if (!recorded || (changes === 0 && recorded.request_id !== request.id))
        return yield* loanFailure(
          "The repayment changed before this decision was recorded. Refresh its saved history.",
        );
      return yield* receipt(session, request.id, key);
    }
    const bank = yield* preparedBank(session);
    const id = crypto.randomUUID();
    const command = yield* validateRepaymentInstruction(
      {
        operation_id: id,
        key: loanRepaymentCoreKey(id),
        offer: before.offer,
        consented_at: before.repayment.consented_at,
        note: request.note,
      },
      now,
      "dispatch",
    );
    const changes = yield* store
      .run(
        "INSERT INTO loan_repayment_operations(id,request_id,loan_id,bank_id,account_id,client_key,request_json,command_json,actor,original_version,status,version,started_at,observed_at,created_at,updated_at) SELECT ?,r.id,r.loan_id,r.bank_id,r.account_id,?,?,?,'approver',r.version,'executing',0,?,?,?,? FROM loan_repayment_requests r WHERE r.id=? AND r.bank_id=? AND r.version=? AND NOT EXISTS(SELECT 1 FROM loan_repayment_events WHERE bank_id=r.bank_id AND command_key=?) AND NOT EXISTS(SELECT 1 FROM loan_repayment_operations WHERE request_id=r.id AND status IN ('executing','uncertain')) AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=r.bank_id AND account_id=r.account_id AND status IN ('executing','uncertain'))",
        id,
        key,
        JSON.stringify(request),
        JSON.stringify(command),
        now,
        now,
        new Date(now).toISOString(),
        new Date(now).toISOString(),
        request.id,
        session.bank_id,
        request.version,
        key,
      )
      .pipe(Effect.mapError(repaymentUnknown));
    if (changes === 0) {
      const recorded = yield* replayRepayment(session, key, request);
      if (recorded) return yield* receipt(session, recorded.request_id, key);
      return yield* loanFailure(
        "The repayment changed or another original account instruction is unresolved. Inspect it before another payment.",
      );
    }
    if (!Number.isSafeInteger(changes) || changes < 1)
      return yield* Effect.fail(repaymentUnknown());
    // Trigger changes are included in the count. Corroborate this original rather than assuming count=1.
    const reserved = yield* originalRepaymentOperation(
      session,
      request.id,
      id,
    ).pipe(Effect.mapError(repaymentUnknown));
    const claim = yield* store
      .one<{ status: string; version: number }>(
        "SELECT status,version FROM core_write_claims WHERE owner_kind='loan' AND owner_id=? AND bank_id=? AND account_id=?",
        id,
        session.bank_id,
        bank.customer_account,
      )
      .pipe(Effect.mapError(repaymentUnknown));
    if (
      !reserved ||
      reserved.key !== key ||
      reserved.status !== "executing" ||
      reserved.version !== 0 ||
      JSON.stringify(reserved.command_json) !== JSON.stringify(command) ||
      claim?.status !== "executing" ||
      claim.version !== 0
    )
      return yield* Effect.fail(repaymentUnknown());
    const attempt = Effect.gen(function* () {
      if ((yield* product) !== command.offer.owner.product_id)
        return yield* loanFailure(
          "Configured product differs from the original offer. This payment was not dispatched.",
        );
      return yield* (yield* LoanRepayer).dispatch(command);
    });
    const result = yield* Effect.either(attempt);
    const original = { id, version: 0, status: "executing" as const };
    if (Either.isLeft(result))
      yield* persistRepaymentOutcome(
        session,
        original,
        result.left.uncertain ? "uncertain" : "failed",
      );
    else {
      yield* persistRepaymentOutcome(
        session,
        original,
        "confirmed",
        result.right,
      );
      yield* financialView(bank, true).pipe(Effect.catchAll(() => Effect.void));
    }
    return yield* receipt(session, request.id, key);
  });
export const inspectRepayment = (session: Session, id: string) =>
  Effect.gen(function* () {
    if (session.role !== "approver")
      return yield* loanFailure(
        "An approver must inspect the original Core repayment. Saved history remains available to the relationship.",
        403,
      );
    yield* savedRepaymentDetail(session, id);
    const original = yield* originalRepaymentOperation(session, id);
    if (!original) return yield* savedRepaymentDetail(session, id);
    if (original.status === "confirmed" || original.status === "failed")
      return yield* receipt(session, id, original.key);
    const result = yield* Effect.either(
      (yield* LoanRepayer).confirm(original.command_json),
    );
    if (Either.isLeft(result)) {
      if (original.status === "executing")
        yield* persistRepaymentOutcome(session, original, "uncertain");
    } else {
      yield* persistRepaymentOutcome(
        session,
        original,
        "confirmed",
        result.right,
      );
      yield* preparedBank(session).pipe(
        Effect.flatMap((bank) => financialView(bank, true)),
        Effect.catchAll(() => Effect.void),
      );
    }
    return yield* receipt(session, id, original.key);
  });
