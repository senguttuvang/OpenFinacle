import { Clock, Effect, Schema } from "effect";
import type { Session } from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import {
  type AccountingEvidence,
  GlChart,
  JournalPage,
  ProductAccounting,
} from "../domain/accounting";
import { branchCustomer } from "./branch-day";

export const readAccounting = (session: Session, customerId: string) =>
  Effect.gen(function* () {
    const { customer } = yield* branchCustomer(session, customerId);
    const core = yield* Core;
    const errors: string[] = [];
    const read = <A, I>(path: string, schema: Schema.Schema<A, I>) =>
      core.request<unknown>("GET", path).pipe(
        Effect.flatMap(Schema.decodeUnknown(schema)),
        Effect.catchAll(() => {
          errors.push(`Core evidence unavailable or invalid: ${path}`);
          return Effect.succeed(null);
        }),
      );
    const account = yield* read(
      `savingsaccounts/${customer.account_id}`,
      Schema.Struct({
        id: Schema.Number,
        clientId: Schema.Number,
        savingsProductId: Schema.Number,
      }),
    );
    if (
      account &&
      (account.id !== customer.account_id ||
        account.clientId !== customer.client_id)
    ) {
      errors.push("Core ownership mismatch. Accounting evidence withheld.");
      return {
        observedAt: yield* Clock.currentTimeMillis,
        chart: null,
        journals: null,
        product: null,
        errors,
      } satisfies AccountingEvidence;
    }
    if (!account)
      return {
        observedAt: yield* Clock.currentTimeMillis,
        chart: null,
        journals: null,
        product: null,
        errors,
      } satisfies AccountingEvidence;
    const chart = yield* read("glaccounts", GlChart);
    let journals = yield* read(
      `journalentries?savingsId=${customer.account_id}&limit=200&offset=0&transactionDetails=true`,
      JournalPage,
    );
    if (
      journals?.pageItems.some(
        (j) => j.entityId !== customer.account_id || j.entityType?.id !== 2,
      )
    ) {
      errors.push(
        "Core returned a different subledger. Journal evidence withheld.",
      );
      journals = null;
    }
    const product = yield* read(
      `savingsproducts/${account.savingsProductId}`,
      ProductAccounting,
    );
    return {
      observedAt: yield* Clock.currentTimeMillis,
      chart,
      journals,
      product,
      errors,
    } satisfies AccountingEvidence;
  });
