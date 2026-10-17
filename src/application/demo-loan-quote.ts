import { Clock, Effect } from "effect";
import { BankingError, bankingDate } from "../domain/banking";
import { LoanEngine } from "../domain/loan-engine";
import { type LoanTerms, normalizeLoanTerms } from "../domain/loans";
import { scenarioBank } from "./demo-scenarios";
import { loanSetupInventory, loanSetupStatus } from "./loan-setup";

// Explicit administrative compatibility proof only; no saved customer quote/application.
export const previewDemoLoan = (input: LoanTerms) =>
  Effect.gen(function* () {
    const terms = yield* normalizeLoanTerms(input);
    const setup = yield* loanSetupStatus();
    if (setup.next !== null || setup.pending !== null)
      return yield* Effect.fail(
        new BankingError({
          message:
            "Complete and verify the saved loan-reference setup before checking core quotes.",
          status: 409,
        }),
      );
    const inventory = yield* loanSetupInventory();
    if (inventory.product_id === null)
      return yield* Effect.fail(
        new BankingError({
          message:
            "The configured loan product is missing. Inspect setup; no automatic recreation is permitted.",
          status: 503,
        }),
      );
    const bank = yield* scenarioBank("existing");
    const expectedDate = bankingDate(yield* Clock.currentTimeMillis);
    const schedule = yield* (yield* LoanEngine).quote({
      owner: {
        bank_id: bank.id,
        product_id: inventory.product_id,
        client_id: bank.customer_client,
        savings_account_id: bank.customer_account,
      },
      terms,
      expected_disbursement_date: expectedDate,
    });
    return {
      terms,
      expected_disbursement_date: expectedDate,
      schedule,
      application_created: false as const,
      financial_posted: false as const,
    };
  });
