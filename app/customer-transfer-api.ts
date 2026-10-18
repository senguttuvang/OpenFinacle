import { Effect, Schema } from "effect";
import { BankingError, moneyToMinor } from "../src/domain/banking";
import { api } from "./api";

const id = Schema.NonEmptyString;
const positive = Schema.Number.pipe(Schema.int(), Schema.positive());
const minor = Schema.Number.pipe(Schema.int(), Schema.nonNegative());
const date = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/));
const Review = Schema.Struct({
  offer: Schema.Struct({
    id,
    bank_id: id,
    sender_id: id,
    recipient_id: id,
    amount_minor: positive,
    payment_date: date,
    expires_at: positive,
  }),
  sender_name: id,
  sender_suffix: id,
  recipient_name: id,
  recipient_suffix: id,
});
export type CustomerTransferReview = typeof Review.Type;
const Pending = Schema.Struct({
  schema: Schema.Literal(1),
  bank_id: id,
  key: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{10,100}$/)),
  review: Review,
});
export type CustomerTransferPending = typeof Pending.Type;
const Outcome = Schema.Struct({
  id,
  offer_id: id,
  key: id,
  bank_id: id,
  status: Schema.Literal(
    "pending",
    "executing",
    "uncertain",
    "posted",
    "failed",
  ),
  receipt: Schema.NullOr(
    Schema.Struct({
      transfer_id: positive,
      debit_id: positive,
      credit_id: positive,
      amount_minor: positive,
      date,
      source_balance_minor: minor,
      recipient_balance_minor: minor,
    }),
  ),
});
const failure = () =>
  new BankingError({
    message:
      "The original transfer reference or response could not be verified. Preserve it and inspect the original before another transfer.",
    status: 409,
    uncertain: true,
  });
const storageFailure = () =>
  new BankingError({
    message:
      "Original transfer storage is unavailable. Restore browser storage and reload before sending any transfer.",
    status: 503,
    uncertain: true,
  });
const key = (bankId: string) => `openfinacle:customer-transfer:${bankId}`;
const storage = <A>(operation: () => A) =>
  Effect.try({ try: operation, catch: storageFailure });
export const loadCustomerTransferPending = (bankId: string) =>
  Effect.gen(function* () {
    const raw = yield* storage(() => sessionStorage.getItem(key(bankId)));
    if (raw === null) return null;
    const pending = yield* Schema.decodeUnknown(Schema.parseJson(Pending), {
      onExcessProperty: "error",
    })(raw).pipe(Effect.mapError(failure));
    if (pending.bank_id !== bankId || pending.review.offer.bank_id !== bankId)
      return yield* Effect.fail(failure());
    return pending;
  });
export const saveCustomerTransferPending = (pending: CustomerTransferPending) =>
  Effect.gen(function* () {
    yield* Schema.decodeUnknown(Pending, { onExcessProperty: "error" })(
      pending,
    ).pipe(Effect.mapError(failure));
    if (pending.bank_id !== pending.review.offer.bank_id)
      return yield* Effect.fail(failure());
    const encoded = JSON.stringify(pending);
    yield* storage(() => sessionStorage.setItem(key(pending.bank_id), encoded));
    if (
      (yield* storage(() => sessionStorage.getItem(key(pending.bank_id)))) !==
      encoded
    )
      return yield* Effect.fail(storageFailure());
  });
const clearOriginal = (pending: CustomerTransferPending) =>
  Effect.gen(function* () {
    const saved = yield* loadCustomerTransferPending(pending.bank_id);
    if (!saved || JSON.stringify(saved) !== JSON.stringify(pending))
      return yield* Effect.fail(failure());
    yield* storage(() => sessionStorage.removeItem(key(pending.bank_id)));
  });
export const customerTransferReviewApi = (
  bankId: string,
  recipientId: string,
  amount: string,
) =>
  api<unknown>("/customer-transfers/review", { recipientId, amount }).pipe(
    Effect.flatMap(Schema.decodeUnknown(Review)),
    Effect.flatMap((review) =>
      Effect.try({
        try: () => {
          if (
            review.offer.bank_id !== bankId ||
            review.offer.recipient_id !== recipientId ||
            review.offer.amount_minor !== moneyToMinor(Number(amount))
          )
            throw failure();
          return review;
        },
        catch: failure,
      }),
    ),
    Effect.mapError(failure),
  );
export const customerTransferOutcome = (
  input: unknown,
  bankId: string,
  pending: CustomerTransferPending | null,
  commandId?: string,
) =>
  Effect.gen(function* () {
    const result = yield* Schema.decodeUnknown(Outcome, {
      onExcessProperty: "error",
    })(input).pipe(Effect.mapError(failure));
    if (
      result.bank_id !== bankId ||
      (commandId && result.id !== commandId) ||
      (pending &&
        (result.key !== pending.key ||
          result.offer_id !== pending.review.offer.id)) ||
      (result.status === "posted"
        ? !result.receipt
        : result.receipt !== null) ||
      (result.receipt &&
        pending &&
        (result.receipt.amount_minor !== pending.review.offer.amount_minor ||
          result.receipt.date !== pending.review.offer.payment_date))
    )
      return yield* Effect.fail(failure());
    if (pending && ["posted", "failed"].includes(result.status))
      yield* clearOriginal(pending);
    return result;
  });
export const customerTransferHistoryApi = () =>
  api<unknown>("/customer-transfers/history").pipe(
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.Struct({
          transfers: Schema.Array(
            Schema.Struct({
              id,
              status: Schema.Literal(
                "pending",
                "executing",
                "uncertain",
                "posted",
                "failed",
                "rejected",
              ),
              amount_minor: positive,
              created_at: Schema.String,
              recipient_name: id,
            }),
          ),
        }),
      ),
    ),
    Effect.mapError(failure),
  );
