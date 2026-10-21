import { afterEach } from "bun:test";
import { Effect } from "effect";
import {
  customerSeedStatus,
  prepareCustomerManifest,
  resumeCustomerSeed,
} from "../../src/demo/customers/customer-provisioning";
import type { Session } from "../../src/platform/banking-workspace/domain/banking";
import { registeredCustomer } from "../../src/platform/customers/application/customer-registry";
import type { CustomerProvisionerService } from "../../src/platform/customers/domain/customer-provisioning";
import {
  confirmPayee,
  reviewPayee,
} from "../../src/platform/payments/application/customer-payees";
import { customerHarness } from "../fixtures/customer-banking";

export function createHarness() {
  const harnesses: ReturnType<typeof customerHarness>[] = [];
  const setup = () => {
    const h = customerHarness();
    harnesses.push(h);
    return h;
  };
  afterEach(() => {
    for (const h of harnesses.splice(0)) h.db.close();
  });
  const session = (bank = "branch"): Session => ({
    token_hash: `session-${bank}`,
    bank_id: bank,
    role: "customer",
    expires_at: Date.now() + 600000,
  });
  const run = <A, E>(
    h: ReturnType<typeof customerHarness>,
    effect: Effect.Effect<
      A,
      E,
      | Effect.Effect.Context<ReturnType<typeof prepareCustomerManifest>>
      | CustomerProvisionerService
      | import("../../src/platform/payments/domain/customer-transfers").CustomerTransferService
    >,
  ) => Effect.runPromise(effect.pipe(Effect.provide(h.layer)));
  const twoCustomers = async () => {
    const h = setup();
    await run(h, prepareCustomerManifest("branch"));
    await run(h, resumeCustomerSeed("branch", 1, 1));
    const rows = (await run(h, customerSeedStatus("branch"))).customers;
    const customer = await run(h, registeredCustomer(rows[0].id));
    const payee = await run(
      h,
      reviewPayee(session(), customer.display_name, customer.account_no),
    );
    await run(h, confirmPayee(session(), payee.review_id));
    return {
      h,
      source: session(),
      recipientId: rows[0].id,
      recipient: session(rows[0].id),
    };
  };
  return {
    get harnesses() {
      return harnesses;
    },
    get setup() {
      return setup;
    },
    get session() {
      return session;
    },
    get run() {
      return run;
    },
    get twoCustomers() {
      return twoCustomers;
    },
  };
}
