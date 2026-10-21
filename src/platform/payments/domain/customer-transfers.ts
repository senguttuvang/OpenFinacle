import { Context, type Effect } from "effect";
import type { BankingError } from "../../banking-workspace/domain/banking";
import type {
  RegisteredCustomer,
  TransferInstruction,
  TransferReceipt,
} from "../../customers/domain/customer-registry";

export interface CustomerTransferService {
  available: (
    sender: RegisteredCustomer,
    recipient: RegisteredCustomer,
  ) => Effect.Effect<number, BankingError>;
  dispatch: (
    instruction: TransferInstruction,
  ) => Effect.Effect<TransferReceipt, BankingError>;
  confirm: (
    instruction: TransferInstruction,
  ) => Effect.Effect<TransferReceipt, BankingError>;
}
export const CustomerTransfers = Context.GenericTag<CustomerTransferService>(
  "OpenFinacle/CustomerTransfers",
);
