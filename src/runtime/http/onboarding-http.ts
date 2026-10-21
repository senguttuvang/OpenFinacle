import { Effect, Schema } from "effect";
import {
  inspectOnboardingOpening,
  onboardingStatus,
  saveOnboardingDraft,
  startOnboardingDraft,
  submitOnboarding,
} from "../../platform/account-opening/application/onboarding";
import { OnboardingSave } from "../../platform/account-opening/domain/onboarding";
import { requiredBank } from "../../platform/banking-workspace/application/banking";
import { financialView } from "../../platform/banking-workspace/application/financial-view";
import {
  BankingError,
  type Session,
} from "../../platform/banking-workspace/domain/banking";
import { Store } from "../../platform/banking-workspace/domain/ports";
import {
  createApplicantScope,
  registerOpenedCustomer,
} from "../../platform/customers/application/customer-registry";
import { parseJsonRequest } from "./request-json";

export const onboardingRoute = (request: Request, session: Session) =>
  Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    if (path === "/api/application" && request.method === "POST") {
      const store = yield* Store;
      const staged = yield* store.one(
        "SELECT id FROM onboarding_drafts WHERE bank_id=?",
        session.bank_id,
      );
      if (staged)
        return yield* Effect.fail(
          new BankingError({
            message:
              "Use the staged savings application to review and submit this applicant's details.",
            status: 409,
          }),
        );
      return null;
    }
    if (path === "/api/onboarding/start" && request.method === "POST") {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({ operationId: Schema.String }),
        false,
        true,
      );
      const scope = yield* createApplicantScope(session, input.operationId);
      const applicant = { ...session, bank_id: scope.bankId };
      const store = yield* Store;
      // Keep the original session identity used by the registry owner binding.
      yield* store.run(
        "UPDATE sessions SET bank_id=? WHERE token_hash=?",
        scope.bankId,
        session.token_hash,
      );
      return Response.json(
        yield* startOnboardingDraft(applicant, input.operationId),
      );
    }
    if (path === "/api/onboarding" && request.method === "GET")
      return Response.json(yield* onboardingStatus(session));
    if (path === "/api/onboarding/draft" && request.method === "POST")
      return Response.json(
        yield* saveOnboardingDraft(
          session,
          yield* parseJsonRequest(request, OnboardingSave, false, true),
        ),
      );
    if (path === "/api/onboarding/submit" && request.method === "POST") {
      const input = yield* parseJsonRequest(
        request,
        Schema.Struct({
          operationId: Schema.String,
          version: Schema.Int.pipe(Schema.nonNegative()),
        }),
        false,
        true,
      );
      return Response.json(
        yield* submitOnboarding(session, input.operationId, input.version),
      );
    }
    if (
      path === "/api/onboarding/inspect-opening" &&
      request.method === "POST"
    ) {
      yield* parseJsonRequest(request, Schema.Struct({}), false, true);
      yield* inspectOnboardingOpening(session);
      yield* registerOpenedCustomer(session);
      yield* financialView(yield* requiredBank(session), true);
      return Response.json(yield* onboardingStatus(session));
    }
    if (path === "/api/onboarding/continue" && request.method === "POST") {
      yield* parseJsonRequest(request, Schema.Struct({}), false, true);
      const saved = yield* onboardingStatus(session);
      if (saved.account) {
        yield* registerOpenedCustomer(session);
        yield* financialView(yield* requiredBank(session), true);
      }
      return Response.json(saved);
    }
    return null;
  });
