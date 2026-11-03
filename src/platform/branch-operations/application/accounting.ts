import { Clock, Effect, Schema } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Core } from "../../banking-workspace/domain/ports";
import {
  type AccountingEvidence,
  GlChart,
  JournalPage,
  ProductAccounting,
} from "../domain/accounting";
import { branchCustomer } from "./branch-day";

export const readAccounting = (
  session: Session,
  customerId: string,
  offset = 0,
) =>
  Effect.gen(function* () {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
      return yield* Effect.fail(
        new BankingError({
          message: "Choose a valid journal page.",
          status: 400,
        }),
      );
    const coverage = {
      offset,
      limit: 200,
      sourceRows: 0,
      excludedRows: 0,
      hasMore: false,
    };
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
        coverage,
        observedAt: yield* Clock.currentTimeMillis,
        chart: null,
        journals: null,
        product: null,
        errors,
      } satisfies AccountingEvidence;
    }
    if (!account)
      return {
        coverage,
        observedAt: yield* Clock.currentTimeMillis,
        chart: null,
        journals: null,
        product: null,
        errors,
      } satisfies AccountingEvidence;
    const chart = yield* read("glaccounts", GlChart);
    let journals = yield* read(
      `journalentries?savingsId=${customer.account_id}&limit=200&offset=${offset}&transactionDetails=true`,
      JournalPage,
    );
    if (journals) {
      coverage.sourceRows = journals.pageItems.length;
      coverage.hasMore =
        offset + coverage.sourceRows < journals.totalFilteredRecords;
      if (
        journals.pageItems.some(
          (j) => j.entityType?.id === 2 && j.entityId !== customer.account_id,
        )
      ) {
        errors.push(
          "Core returned a different subledger. Journal evidence withheld.",
        );
        journals = null;
      } else {
        const owned = journals.pageItems.filter(
          (j) => j.entityType?.id === 2 && j.entityId === customer.account_id,
        );
        coverage.excludedRows = journals.pageItems.length - owned.length;
        if (coverage.excludedRows)
          errors.push(
            "Excluded " +
              coverage.excludedRows +
              " counterpart or unidentified journal rows. Savings evidence is partial; reconciliation is not established.",
          );
        journals = { ...journals, pageItems: owned };
      }
    }
    const product = yield* read(
      `savingsproducts/${account.savingsProductId}`,
      ProductAccounting,
    );
    return {
      coverage,
      observedAt: yield* Clock.currentTimeMillis,
      chart,
      journals,
      product,
      errors,
    } satisfies AccountingEvidence;
  });
