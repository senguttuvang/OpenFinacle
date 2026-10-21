import { Effect } from "effect";
import { dashboard } from "../../banking-workspace/application/banking";
import type { Session } from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import { savedPayees } from "../../payments/application/customer-payees";
import { selectedCustomer } from "./customer-registry";

export const customerDashboard = (session: Session, refresh = false) =>
  Effect.gen(function* () {
    const value = yield* dashboard(session, refresh);
    const store = yield* Store;
    const applicant = yield* store.one(
      "SELECT bank_id FROM customer_applicant_scopes WHERE bank_id=?",
      session.bank_id,
    );
    const customer = yield* selectedCustomer(session);
    const payees =
      customer && session.role === "customer"
        ? yield* savedPayees(session)
        : null;
    const first = payees?.payees[0];
    return {
      ...value,
      bank: { ...value.bank, applicant: Boolean(applicant) },
      customer,
      payeeSummary: payees
        ? {
            count: payees.count,
            first: first
              ? {
                  id: first.id,
                  recipient_id: first.recipient_id,
                  display_name: first.display_name,
                  account_suffix: first.account_suffix,
                }
              : null,
            maximum: payees.maximum,
          }
        : null,
    };
  });
