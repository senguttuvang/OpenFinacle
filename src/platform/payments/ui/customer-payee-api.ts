import { Effect, Schema } from "effect";
import { BankingError } from "../../banking-workspace/domain/banking";
import { api } from "../../banking-workspace/ui/api";

const text = Schema.NonEmptyString;
const SavedPayees = Schema.Struct({
  payees: Schema.Array(
    Schema.Struct({
      id: text,
      recipient_id: text,
      display_name: text,
      reference: text,
      account_suffix: text,
    }),
  ),
  count: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  maximum: Schema.Literal(50),
});
const Review = Schema.Struct({
  review_id: text,
  expires_at: Schema.Number,
  display_name: text,
  reference: text,
  account_suffix: text,
});
export type PayeeReview = typeof Review.Type;
export type PayeeList = typeof SavedPayees.Type;
const failure = () =>
  new BankingError({
    message:
      "Saved payee response could not be verified. Reload before continuing.",
    status: 409,
  });
export const payeeListApi = (
  action = "",
  body?: { reviewId: string } | { payeeId: string },
) =>
  api<unknown>(`/customers/payees${action}`, body).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknown(SavedPayees)(value).pipe(Effect.mapError(failure)),
    ),
  );
export const payeeReviewApi = (holderName: string, accountNumber: string) =>
  api<unknown>("/customers/payees/review", { holderName, accountNumber }).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknown(Review)(value).pipe(Effect.mapError(failure)),
    ),
  );
