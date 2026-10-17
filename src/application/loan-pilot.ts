import { Effect } from "effect";
import type { Session } from "../domain/banking";
import type { LoanPilotCommand } from "../domain/loan-pilot";
import { scenarioBank } from "./demo-scenarios";
import {
  actOnLoan,
  createLoanQuote,
  inspectOriginalLoan,
  refreshLoanCoreView,
  submitLoanApplication,
} from "./loan-origination";
import {
  listLoanApplications,
  savedLoanDetail,
  savedLoanForKey,
} from "./loan-records";

// Protected demo administrator only. Explicit simulated roles, never a customer-auth bypass route.
export const runLoanPilot = (input: LoanPilotCommand) =>
  Effect.gen(function* () {
    const bank = yield* scenarioBank("existing");
    const session: Session = {
      bank_id: bank.id,
      role: input.role,
      token_hash: "administrative-demonstration-pilot",
      expires_at: Number.MAX_SAFE_INTEGER,
    };
    switch (input.kind) {
      case "list":
        return yield* listLoanApplications(session);
      case "detail":
        return yield* savedLoanDetail(session, input.id);
      case "reference":
        return yield* savedLoanForKey(session, input.key);
      case "quote":
        return yield* createLoanQuote(session, input.terms);
      case "submit":
        return yield* submitLoanApplication(
          session,
          input.submission,
          input.key,
          "admin-pilot",
        );
      case "action":
        return yield* actOnLoan(session, input.command, input.key);
      case "inspect":
        return yield* inspectOriginalLoan(session, input.id);
      case "refresh":
        return yield* refreshLoanCoreView(session, input.id);
    }
  });
