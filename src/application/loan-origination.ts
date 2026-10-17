import { Effect, Either, Schema } from "effect";
import { BankingError, bankingDate, type Session } from "../domain/banking";
import { LoanEngine, LoanEnquiry } from "../domain/loan-engine";
import {
  type LoanApplication,
  LoanQuotePreview,
  LoanSubmission,
  safeLoanProofChecks,
} from "../domain/loan-workflow";
import { LoanWriter } from "../domain/loan-writing";
import {
  LoanCommand,
  loanAffordability,
  loanDecision,
  normalizeLoanTerms,
  validateLoanQuote,
} from "../domain/loans";
import { Store } from "../domain/ports";
import { requiredBank } from "./banking";
import { financialView } from "./financial-view";
import {
  insertLoanAcceptance,
  insertLoanDecision,
  loanFailure,
  loanNow,
  originalLoanOperation,
  persistLoanCoreView,
  persistLoanOutcome,
  persistLoanQuote,
  readLoanValue,
  readOwnedLoanQuote,
  replayLoanRequest,
  reserveLoanOperation,
  savedLoanDetail,
} from "./loan-records";
import { loanSetupInventory, loanSetupStatus } from "./loan-setup";

const inputValue = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknown(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "Choose valid original loan instruction fields and an explicit review decision.",
          status: 400,
        }),
    ),
  );
const configuredProduct = Effect.gen(function* () {
  const setup = yield* loanSetupStatus();
  if (setup.next !== null || setup.pending !== null)
    return yield* loanFailure(
      "Loan references require operator verification before another financial stage.",
    );
  const inventory = yield* loanSetupInventory();
  if (inventory.product_id === null)
    return yield* loanFailure(
      "The saved loan product could not be verified. No automatic recreation is permitted.",
      503,
    );
  return inventory.product_id;
});
const preparedBank = (session: Session) =>
  Effect.gen(function* () {
    const bank = yield* requiredBank(session);
    if (
      bank.status !== "ready" ||
      bank.customer_account <= 0 ||
      bank.customer_client <= 0
    )
      return yield* loanFailure(
        "Open this relationship's owned savings account before starting a loan.",
      );
    return bank;
  });
const recordedDetail = (session: Session, id: string, key: string) =>
  savedLoanDetail(session, id, key).pipe(
    Effect.mapError(
      () =>
        new BankingError({
          message:
            "The original loan instruction's saved response could not be read. Check its reference; do not send another Core instruction.",
          status: 503,
          uncertain: true,
        }),
    ),
  );
export const createLoanQuote = (session: Session, input: unknown) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* loanFailure(
        "Request and review loan terms as the customer.",
        403,
      );
    const terms = yield* normalizeLoanTerms(input);
    const bank = yield* preparedBank(session);
    const product = yield* configuredProduct;
    const now = yield* loanNow;
    const owner = {
      bank_id: bank.id,
      product_id: product,
      client_id: bank.customer_client,
      savings_account_id: bank.customer_account,
    };
    const expected = bankingDate(now);
    const schedule = yield* (yield* LoanEngine).quote({
      owner,
      terms,
      expected_disbursement_date: expected,
    });
    const quote = yield* validateLoanQuote(
      {
        id: crypto.randomUUID(),
        ...owner,
        terms,
        expected_disbursement_date: expected,
        quoted_at: now,
        expires_at: now + 900000,
        schedule,
      },
      terms,
      owner,
      yield* loanNow,
    );
    yield* persistLoanQuote(quote);
    return yield* readLoanValue(LoanQuotePreview, {
      source: "fineract",
      quote,
      affordability: loanAffordability(quote),
      application_created: false,
      financial_posted: false,
    });
  });
export const submitLoanApplication = (
  session: Session,
  input: unknown,
  key: string,
  origin: LoanApplication["origin"] = "customer",
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* loanFailure(
        "Only the customer can accept and submit a loan quote.",
        403,
      );
    const parsed = yield* inputValue(LoanSubmission, input);
    const request = { quote_id: parsed.quote_id, consent: true as const };
    const replay = yield* replayLoanRequest(session, key, request);
    if (replay) return yield* recordedDetail(session, replay.loan_id, key);
    const bank = yield* preparedBank(session);
    const quote = yield* readOwnedLoanQuote(session, request.quote_id);
    const now = yield* loanNow;
    yield* validateLoanQuote(
      quote,
      quote.terms,
      {
        bank_id: bank.id,
        product_id: quote.product_id,
        client_id: bank.customer_client,
        savings_account_id: bank.customer_account,
      },
      now,
    );
    if (!loanAffordability(quote).within_declared_surplus)
      return yield* loanFailure(
        "The largest Core installment exceeds the declared monthly surplus. Review different terms before applying.",
        400,
      );
    const result = yield* insertLoanAcceptance(
      session,
      quote,
      key,
      origin,
      now,
    );
    if (result.inserted > 0)
      return yield* recordedDetail(session, result.id, key);
    const concurrent = yield* replayLoanRequest(session, key, request);
    if (concurrent)
      return yield* recordedDetail(session, concurrent.loan_id, key);
    return yield* loanFailure(
      "This quote is already accepted or another unfunded application exists. Inspect its saved history before applying again.",
    );
  });
export const actOnLoan = (session: Session, input: unknown, key: string) =>
  Effect.gen(function* () {
    const parsed = yield* inputValue(LoanCommand, input);
    const request = {
      id: parsed.id,
      version: parsed.version,
      action: parsed.action,
      note: parsed.note.trim(),
    };
    const replay = yield* replayLoanRequest(session, key, request);
    if (replay) return yield* recordedDetail(session, replay.loan_id, key);
    const before = yield* savedLoanDetail(session, request.id);
    const pending =
      before.operation?.status === "executing" ||
      before.operation?.status === "uncertain";
    const proposal = yield* loanDecision(
      before.loan,
      request,
      session.role,
      pending,
    );
    if (!before.actions.includes(request.action))
      return yield* loanFailure(
        before.unavailable_reason ??
          "This loan instruction is unavailable. Refresh and inspect its original history.",
      );
    const now = yield* loanNow;
    const context = {
      loan: before.loan,
      quote: before.quote,
      owner: {
        bank_id: before.quote.bank_id,
        product_id: before.quote.product_id,
        client_id: before.quote.client_id,
        savings_account_id: before.quote.savings_account_id,
      },
    };
    if (proposal.core_command === null) {
      const inserted = yield* insertLoanDecision(
        session,
        context,
        request,
        proposal,
        key,
        now,
      );
      const recorded = yield* replayLoanRequest(session, key, request);
      if (!recorded || (inserted === 0 && recorded.loan_id !== before.loan.id))
        return yield* loanFailure(
          "The loan changed or has an unresolved original instruction. Refresh its saved history.",
        );
      return yield* recordedDetail(session, recorded.loan_id, key);
    }
    const bank = yield* preparedBank(session);
    const reserved = yield* reserveLoanOperation(
      session,
      context,
      request,
      proposal.core_command,
      key,
      now,
    );
    if (reserved.inserted === 0) {
      const recorded = yield* replayLoanRequest(session, key, request);
      if (recorded)
        return yield* recordedDetail(session, recorded.loan_id, key);
      return yield* loanFailure(
        "The application changed or this account has an unresolved original instruction. Inspect it before another Core write.",
      );
    }
    const writer = yield* LoanWriter;
    const financial =
      proposal.core_command === "register" ||
      proposal.core_command === "approve" ||
      proposal.core_command === "disburse";
    const attempt = Effect.gen(function* () {
      if (financial) {
        const product = yield* configuredProduct.pipe(
          Effect.mapError(
            (error) =>
              new BankingError({
                message:
                  "The financial references could not be verified; this original operation was not dispatched.",
                status: error.status,
              }),
          ),
        );
        if (product !== before.quote.product_id)
          return yield* loanFailure(
            "The configured product differs from the accepted quote; this operation was not dispatched.",
          );
      }
      return yield* writer.dispatch(reserved.command);
    });
    const outcome = yield* Effect.either(attempt);
    if (Either.isLeft(outcome)) {
      yield* persistLoanOutcome(
        session,
        reserved,
        outcome.left.uncertain ? "uncertain" : "failed",
      );
    } else {
      yield* persistLoanOutcome(session, reserved, "confirmed", outcome.right);
      if (proposal.core_command === "disburse")
        yield* financialView(bank, true).pipe(
          Effect.catchAll(() => Effect.void),
        );
    }
    return yield* recordedDetail(session, before.loan.id, key);
  });

// Other roles may inspect saved receipts; only the approver corroborates a Core operation's result.
export const inspectOriginalLoan = (session: Session, id: string) =>
  Effect.gen(function* () {
    if (session.role !== "approver")
      return yield* loanFailure(
        "An approver must check the original Core instruction. Its saved history remains available to the relationship.",
        403,
      );
    yield* savedLoanDetail(session, id);
    const operation = yield* originalLoanOperation(session, id);
    if (
      !operation ||
      operation.status === "confirmed" ||
      operation.status === "failed"
    )
      return yield* savedLoanDetail(session, id);
    const outcome = yield* Effect.either(
      (yield* LoanWriter).confirm(operation.command_json),
    );
    if (Either.isLeft(outcome)) {
      if (operation.status === "executing")
        yield* persistLoanOutcome(session, operation, "uncertain");
    } else {
      yield* persistLoanOutcome(session, operation, "confirmed", outcome.right);
      if (operation.action === "disburse") {
        const bank = yield* preparedBank(session);
        yield* financialView(bank, true).pipe(
          Effect.catchAll(() => Effect.void),
        );
      }
    }
    const detail = yield* recordedDetail(session, id, operation.key);
    return {
      ...detail,
      inspection_checks: Either.isLeft(outcome)
        ? safeLoanProofChecks(outcome.left.loanProofChecks)
        : [],
    };
  });
export const refreshLoanCoreView = (session: Session, id: string) =>
  Effect.gen(function* () {
    const before = yield* savedLoanDetail(session, id);
    if (
      before.operation?.status === "executing" ||
      before.operation?.status === "uncertain"
    )
      return yield* loanFailure(
        "Ask an approver to inspect the original instruction before refreshing this loan.",
      );
    if (before.loan.core_id === null)
      return yield* loanFailure(
        "This application has not been registered in Core.",
      );
    const quote = before.quote;
    const fresh = yield* Effect.either(
      (yield* LoanEnquiry).inspect({
        owner: {
          bank_id: quote.bank_id,
          product_id: quote.product_id,
          client_id: quote.client_id,
          savings_account_id: quote.savings_account_id,
        },
        terms: quote.terms,
        expected_disbursement_date: quote.expected_disbursement_date,
        external_id: `of-loan-${before.loan.id}`,
        core_id: before.loan.core_id,
      }),
    );
    if (Either.isLeft(fresh))
      yield* (yield* Store).run(
        "UPDATE loan_core_views SET stale=1 WHERE loan_id=?",
        id,
      );
    else yield* persistLoanCoreView(id, fresh.right);
    return yield* savedLoanDetail(session, id);
  });
