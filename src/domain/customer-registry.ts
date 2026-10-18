import { Schema } from "effect";

const identifier = Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{1,100}$/));
export const CustomerId = identifier;
export interface RegisteredCustomer {
  id: string;
  branch_id: string;
  bank_id: string;
  reference: string;
  display_name: string;
  client_id: number;
  account_id: number;
  account_no: string;
  origin: "legacy" | "seed" | "onboarding";
  status: "active" | "disabled";
}
export interface CustomerChoice {
  id: string;
  reference: string;
  display_name: string;
  account_suffix: string;
}
export const customerChoice = (row: RegisteredCustomer): CustomerChoice => ({
  id: row.id,
  reference: row.reference,
  display_name: row.display_name,
  account_suffix: row.account_no.slice(-4),
});
export const CustomerSelection = Schema.Struct({ customerId: identifier });
export const TransferReview = Schema.Struct({
  recipientId: identifier,
  amount: Schema.String.pipe(
    Schema.pattern(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/),
  ),
});
export const TransferConfirmation = Schema.Struct({
  offerId: identifier,
  key: Schema.String.pipe(Schema.pattern(/^[a-zA-Z0-9_-]{10,100}$/)),
});
export interface TransferOffer {
  id: string;
  bank_id: string;
  sender_id: string;
  recipient_id: string;
  amount_minor: number;
  payment_date: string;
  expires_at: number;
}
export interface TransferReceipt {
  transfer_id: number;
  debit_id: number;
  credit_id: number;
  amount_minor: number;
  date: string;
  source_balance_minor: number;
  recipient_balance_minor: number;
}
export interface TransferInstruction {
  operation_id: string;
  sender: RegisteredCustomer;
  recipient: RegisteredCustomer;
  amount_minor: number;
  date: string;
}
export const transferMarker = (id: string) => `OpenFinacle transfer ${id}`;
