import { Schema } from "effect";
import { CustomerId } from "./customer-registry";

export interface SavedPayee {
  id: string;
  recipient_id: string;
  reference: string;
  display_name: string;
  account_suffix: string;
}
export const PayeeLookup = Schema.Struct({
  holderName: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(120)),
  accountNumber: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9-]{1,100}$/)),
});
export const PayeeConfirmation = Schema.Struct({ reviewId: CustomerId });
export const PayeeRemoval = Schema.Struct({ payeeId: CustomerId });
export const PayeeAdminCommand = Schema.Struct({
  action: Schema.Literal("status", "prepare", "resume"),
  branchId: CustomerId,
  start: Schema.Number.pipe(Schema.int(), Schema.between(1, 150)),
  limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 10)),
});
