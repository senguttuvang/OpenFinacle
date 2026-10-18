import { Effect, Layer, Schema } from "effect";
import { BankingError, dateFields } from "../domain/banking";
import {
  CustomerProvisioner,
  type SeedCustomer,
  type SeedOperation,
  type SeedProof,
} from "../domain/customer-provisioning";
import { LoanQuote } from "../domain/loans";
import { Core, Store } from "../domain/ports";
import { loanCoreCalendar, loanCoreDateParts } from "./loan-engine";

const id = Schema.Number.pipe(Schema.int(), Schema.positive());
const clientSchema = Schema.Struct({
  id,
  externalId: Schema.String,
  firstname: Schema.String,
  lastname: Schema.String,
  officeId: id,
  active: Schema.Boolean,
});
const accountSchema = Schema.Struct({
  id,
  clientId: id,
  savingsProductId: id,
  externalId: Schema.String,
  accountNo: Schema.NonEmptyString,
  currency: Schema.Struct({
    code: Schema.Literal("INR"),
    decimalPlaces: Schema.Literal(2),
  }),
  status: Schema.Struct({ id, active: Schema.optional(Schema.Boolean) }),
  allowOverdraft: Schema.Boolean,
  withdrawalFeeForTransfers: Schema.Boolean,
  transactions: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id,
        amount: Schema.Number,
        date: Schema.Array(Schema.Number),
        reversed: Schema.Boolean,
        transactionType: Schema.Struct({ id }),
        paymentDetailData: Schema.optional(
          Schema.Struct({ receiptNumber: Schema.optional(Schema.String) }),
        ),
      }),
    ),
  ),
});
const uncertain = () =>
  new BankingError({
    message:
      "Original seed stage is unconfirmed. Inspect its durable external identity or receipt; no write may be retried.",
    status: 503,
    uncertain: true,
  });
const invalid = () =>
  new BankingError({
    message:
      "Synthetic provisioning prerequisites do not match the original manifest.",
    status: 409,
    uncertain: false,
  });
const decode = <A, I>(schema: Schema.Schema<A, I>, input: unknown) =>
  Schema.decodeUnknown(schema)(input).pipe(Effect.mapError(uncertain));
export const customerProvisionerLayer = Layer.effect(
  CustomerProvisioner,
  Effect.gen(function* () {
    const core = yield* Core;
    const store = yield* Store;
    const settings = Effect.gen(function* () {
      const product = yield* store.one<{ value: string }>(
        "SELECT value FROM settings WHERE key='savings_product'",
      );
      const cash = yield* store.one<{ value: string }>(
        "SELECT value FROM settings WHERE key='cash_payment_type'",
      );
      if (
        !product ||
        !cash ||
        !Number.isSafeInteger(Number(product.value)) ||
        Number(product.value) <= 0 ||
        !Number.isSafeInteger(Number(cash.value)) ||
        Number(cash.value) <= 0
      )
        return yield* Effect.fail(invalid());
      return { product: Number(product.value), cash: Number(cash.value) };
    });
    const client = (row: SeedCustomer) =>
      Effect.gen(function* () {
        const value = yield* decode(
          clientSchema,
          yield* core.request(
            "GET",
            `clients/external-id/${encodeURIComponent(row.id)}`,
          ),
        );
        if (
          value.externalId !== row.id ||
          value.firstname !== row.firstname ||
          value.lastname !== row.lastname ||
          value.officeId !== 1 ||
          !value.active ||
          (row.client_id !== null && value.id !== row.client_id)
        )
          return yield* Effect.fail(uncertain());
        return value;
      });
    const account = (row: SeedCustomer) =>
      Effect.gen(function* () {
        const owner = yield* client(row);
        const configured = yield* settings;
        const value = yield* decode(
          accountSchema,
          yield* core.request(
            "GET",
            `savingsaccounts/external-id/${encodeURIComponent(row.id)}?associations=transactions`,
          ),
        );
        if (
          value.externalId !== row.id ||
          value.clientId !== owner.id ||
          value.savingsProductId !== configured.product ||
          value.allowOverdraft ||
          value.withdrawalFeeForTransfers ||
          (row.account_id !== null && row.account_id !== value.id) ||
          (row.account_no !== null && row.account_no !== value.accountNo)
        )
          return yield* Effect.fail(uncertain());
        return value;
      });
    const inspect = (
      row: SeedCustomer,
      operation: SeedOperation,
    ): Effect.Effect<SeedProof, BankingError> =>
      Effect.gen(function* () {
        if (
          operation.seed_id !== row.id ||
          !/^seed-[a-f0-9-]{36}$/.test(operation.command_key)
        )
          return yield* Effect.fail(uncertain());
        if (operation.stage === "client") {
          const value = yield* client(row);
          return { resource_id: value.id, client_id: value.id };
        }
        const value = yield* account(row);
        if (operation.stage === "account")
          return {
            resource_id: value.id,
            account_id: value.id,
            account_no: value.accountNo,
          };
        if (
          operation.stage === "approve" &&
          ![200, 300].includes(value.status.id)
        )
          return yield* Effect.fail(uncertain());
        if (
          (operation.stage === "activate" || operation.stage === "fund") &&
          (value.status.id !== 300 || !value.status.active)
        )
          return yield* Effect.fail(uncertain());
        if (operation.stage === "fund") {
          const configured = yield* settings;
          const candidates =
            value.transactions?.filter(
              (transaction) =>
                !transaction.reversed &&
                transaction.transactionType.id === 1 &&
                Math.abs(transaction.amount * 100 - row.funding_minor) <
                  0.000001 &&
                loanCoreCalendar(transaction.date) === operation.payment_date,
            ) ?? [];
          if (!candidates.length || candidates.length > 32)
            return yield* Effect.fail(uncertain());
          const matches: number[] = [];
          for (const candidate of candidates) {
            // Fineract omits payment details from association lists; read the
            // original owned transaction endpoint before accepting a funding receipt.
            const detail = yield* decode(
              Schema.Struct({
                id,
                accountId: Schema.optional(id),
                amount: Schema.Number,
                currency: Schema.Struct({
                  code: Schema.Literal("INR"),
                  decimalPlaces: Schema.Literal(2),
                }),
                date: loanCoreDateParts.pipe(
                  Schema.filter((parts) =>
                    Schema.is(LoanQuote.fields.expected_disbursement_date)(
                      loanCoreCalendar(parts),
                    ),
                  ),
                ),
                reversed: Schema.Boolean,
                transactionType: Schema.optional(Schema.Struct({ id })),
                paymentDetailData: Schema.optional(
                  Schema.Struct({
                    receiptNumber: Schema.optional(Schema.String),
                    paymentType: Schema.optional(Schema.Struct({ id })),
                  }),
                ),
              }),
              yield* core.request(
                "GET",
                `savingsaccounts/${value.id}/transactions/${candidate.id}`,
              ),
            );
            if (
              detail.id !== candidate.id ||
              (detail.accountId !== undefined &&
                detail.accountId !== value.id) ||
              detail.reversed ||
              (detail.transactionType !== undefined &&
                detail.transactionType.id !== 1) ||
              Math.abs(detail.amount * 100 - row.funding_minor) > 0.000001 ||
              loanCoreCalendar(detail.date) !== operation.payment_date
            )
              return yield* Effect.fail(uncertain());
            if (
              detail.paymentDetailData?.receiptNumber ===
                operation.command_key &&
              detail.paymentDetailData.paymentType?.id === configured.cash
            )
              matches.push(detail.id);
          }
          if (matches.length !== 1) return yield* Effect.fail(uncertain());
          return { resource_id: matches[0] };
        }
        return { resource_id: value.id };
      }).pipe(Effect.mapError(uncertain));
    return {
      inspect,
      dispatch: (row: SeedCustomer, operation: SeedOperation) =>
        Effect.gen(function* () {
          const configured = yield* settings;
          if (
            operation.seed_id !== row.id ||
            !/^seed-[a-f0-9-]{36}$/.test(operation.command_key) ||
            operation.status !== "executing"
          )
            return yield* Effect.fail(invalid());
          const original = yield* store.one<SeedOperation>(
            "SELECT * FROM customer_seed_operations WHERE seed_id=? AND stage=? AND status='executing'",
            row.id,
            operation.stage,
          );
          if (
            !original ||
            original.command_key !== operation.command_key ||
            original.payment_date !== operation.payment_date
          )
            return yield* Effect.fail(invalid());
          const fields = dateFields();
          let path: string;
          let body: unknown;
          if (operation.stage === "client") {
            path = "clients";
            body = {
              ...fields,
              firstname: row.firstname,
              lastname: row.lastname,
              legalFormId: 1,
              officeId: 1,
              active: true,
              activationDate: operation.payment_date,
              externalId: row.id,
            };
          } else if (operation.stage === "account") {
            const owner = yield* client(row);
            if (owner.id !== row.client_id)
              return yield* Effect.fail(invalid());
            path = "savingsaccounts";
            body = {
              ...fields,
              clientId: row.client_id,
              productId: configured.product,
              submittedOnDate: operation.payment_date,
              externalId: row.id,
              allowOverdraft: false,
              withdrawalFeeForTransfers: false,
            };
          } else {
            const owned = yield* account(row);
            if (
              owned.id !== row.account_id ||
              (operation.stage === "approve" && owned.status.id !== 100) ||
              (operation.stage === "activate" && owned.status.id !== 200) ||
              (operation.stage === "fund" &&
                (owned.status.id !== 300 || !owned.status.active))
            )
              return yield* Effect.fail(invalid());
            path =
              operation.stage === "fund"
                ? `savingsaccounts/${owned.id}/transactions?command=deposit`
                : `savingsaccounts/${owned.id}?command=${operation.stage}`;
            body =
              operation.stage === "fund"
                ? {
                    ...fields,
                    transactionDate: operation.payment_date,
                    transactionAmount: row.funding_minor / 100,
                    paymentTypeId: configured.cash,
                    receiptNumber: operation.command_key,
                  }
                : operation.stage === "approve"
                  ? { ...fields, approvedOnDate: operation.payment_date }
                  : { ...fields, activatedOnDate: operation.payment_date };
          }
          yield* core
            .request("POST", path, body, operation.command_key)
            .pipe(
              Effect.mapError((error) =>
                error.uncertain === false ? error : uncertain(),
              ),
            );
          return yield* inspect(row, operation);
        }),
    };
  }),
);
