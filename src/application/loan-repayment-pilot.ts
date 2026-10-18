import { Effect } from "effect";
import type { Session } from "../domain/banking";
import type { RepaymentPilotCommand } from "../domain/loan-repayment-pilot";
import { scenarioBank } from "./demo-scenarios";
import {
  actOnRepayment,
  createRepaymentOffer,
  inspectRepayment,
  submitRepayment,
} from "./loan-repayment";
import {
  listRepayments,
  savedRepaymentDetail,
  savedRepaymentForKey,
} from "./loan-repayment-records";

// Exact existing synthetic relationship, behind the demo-only administrator boundary.
export const runRepaymentPilot = (input: RepaymentPilotCommand) =>
  Effect.gen(function* () {
    const bank = yield* scenarioBank("existing");
    const session: Session = {
      bank_id: bank.id,
      role: input.role,
      token_hash: "administrative-repayment-demonstration",
      expires_at: Number.MAX_SAFE_INTEGER,
    };
    switch (input.kind) {
      case "list":
        return yield* listRepayments(session, input.loan_id);
      case "detail":
        return yield* savedRepaymentDetail(session, input.id);
      case "reference":
        return yield* savedRepaymentForKey(session, input.key);
      case "quote":
        return yield* createRepaymentOffer(session, input.input);
      case "submit":
        return yield* submitRepayment(
          session,
          input.submission,
          input.key,
          "admin-pilot",
        );
      case "action":
        return yield* actOnRepayment(session, input.command, input.key);
      case "inspect":
        return yield* inspectRepayment(session, input.id);
    }
  });
