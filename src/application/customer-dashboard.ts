import { Effect } from "effect";
import type { Session } from "../domain/banking";
import { Store } from "../domain/ports";
import { dashboard } from "./banking";
import { selectedCustomer } from "./customer-registry";

export const customerDashboard = (session: Session, refresh = false) =>
  Effect.gen(function* () {
    const value = yield* dashboard(session, refresh);
    const store = yield* Store;
    const applicant = yield* store.one(
      "SELECT bank_id FROM customer_applicant_scopes WHERE bank_id=?",
      session.bank_id,
    );
    return {
      ...value,
      bank: { ...value.bank, applicant: Boolean(applicant) },
      customer: yield* selectedCustomer(session),
    };
  });
