import { Clock, Effect } from "effect";
import {
  type BankingCommand,
  BankingError,
  bankingDate,
  type Session,
} from "../domain/banking";
import type {
  RegisteredCustomer,
  TransferInstruction,
  TransferOffer,
  TransferReceipt,
} from "../domain/customer-registry";
import { CustomerTransfers } from "../domain/customer-transfers";
import { Store } from "../domain/ports";
import { activePayee } from "./customer-payees";
import { registeredCustomer, sessionCustomer } from "./customer-registry";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status, uncertain: false }));
const customerOnly = (session: Session) =>
  session.role === "customer"
    ? Effect.void
    : fail("Confirm a self-service transfer as the selected customer.", 403);
export const customerTransferHistory = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* sessionCustomer(session);
    return yield* store.all<{
      id: string;
      status: string;
      amount_minor: number;
      created_at: string;
      recipient_name: string;
    }>(
      "SELECT c.id,c.status,c.amount_minor,c.created_at,r.display_name AS recipient_name FROM customer_transfers t JOIN commands c ON c.id=t.command_id JOIN customer_transfer_offers o ON o.id=t.offer_id JOIN customers r ON r.id=o.recipient_id WHERE t.bank_id=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT 100",
      session.bank_id,
    );
  });
export const reviewCustomerTransfer = (
  session: Session,
  recipientId: string,
  amount: string,
) =>
  Effect.gen(function* () {
    yield* customerOnly(session);
    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(amount))
      return yield* fail(
        "Enter an exact positive INR amount with at most two decimal places.",
        400,
      );
    const [rupees, paise = ""] = amount.split(".");
    const amountMinor = Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
    if (
      !Number.isSafeInteger(amountMinor) ||
      amountMinor < 1 ||
      amountMinor > 1000000000
    )
      return yield* fail("Choose an amount between ₹0.01 and ₹1 crore.", 400);
    const sender = yield* sessionCustomer(session);
    const payee = yield* activePayee(sender.id, recipientId);
    const recipient = yield* registeredCustomer(recipientId);
    const transfer = yield* CustomerTransfers;
    const available = yield* transfer.available(sender, recipient);
    if (available < amountMinor)
      return yield* fail("The transfer exceeds current available funds.", 400);
    const now = yield* Clock.currentTimeMillis;
    const offer: TransferOffer = {
      id: crypto.randomUUID(),
      bank_id: session.bank_id,
      sender_id: sender.id,
      recipient_id: recipient.id,
      amount_minor: amountMinor,
      payment_date: bankingDate(now),
      expires_at: now + 600000,
      payee_id: payee.id,
      payee_version: payee.version,
    };
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO customer_transfer_offers(id,bank_id,sender_id,recipient_id,amount_minor,payment_date,expires_at,payee_id,payee_version) VALUES(?,?,?,?,?,?,?,?,?)",
      offer.id,
      offer.bank_id,
      offer.sender_id,
      offer.recipient_id,
      offer.amount_minor,
      offer.payment_date,
      offer.expires_at,
      payee.id,
      payee.version,
    );
    return {
      offer,
      sender_name: sender.display_name,
      sender_suffix: sender.account_no.slice(-4),
      recipient_name: recipient.display_name,
      recipient_suffix: recipient.account_no.slice(-4),
    };
  });

interface TransferRow {
  command_id: string;
  offer_id: string;
  bank_id: string;
  receipt_json: string | null;
}
const observedOutcome = (
  original: Effect.Effect.Success<ReturnType<typeof loadOriginal>>,
  status: "pending" | "executing" | "uncertain" | "posted" | "failed",
  receipt: TransferReceipt | null,
) => ({
  id: original.command.id,
  offer_id: original.offer.id,
  bank_id: original.command.bank_id,
  key: original.command.key,
  status,
  receipt,
  message:
    status === "failed"
      ? (original.command.error ??
        "This transfer was declined before completion. Review current payee details and funds before a new instruction.")
      : undefined,
});
const loadOriginal = (session: Session, id: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<TransferRow>(
      "SELECT * FROM customer_transfers WHERE command_id=? AND bank_id=?",
      id,
      session.bank_id,
    );
    const command = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE id=? AND bank_id=?",
      id,
      session.bank_id,
    );
    if (!row || !command)
      return yield* fail("Original customer transfer not found.", 404);
    const offer = yield* store.one<TransferOffer>(
      "SELECT * FROM customer_transfer_offers WHERE id=? AND bank_id=?",
      row.offer_id,
      session.bank_id,
    );
    if (!offer)
      return yield* fail("Original customer transfer review not found.");
    const sender = yield* sessionCustomer(session);
    const recipient = yield* store.one<RegisteredCustomer>(
      "SELECT * FROM customers WHERE id=?",
      offer.recipient_id,
    );
    if (!recipient)
      return yield* fail("Original registered recipient not found.");
    if (
      offer.sender_id !== sender.id ||
      sender.branch_id !== recipient.branch_id ||
      command.amount_minor !== offer.amount_minor ||
      command.account_id !== sender.account_id
    )
      return yield* fail(
        "Original transfer ownership does not match this selection.",
      );
    const instruction: TransferInstruction = {
      operation_id: command.id,
      sender,
      recipient,
      amount_minor: offer.amount_minor,
      date: offer.payment_date,
    };
    return { row, command, offer, instruction };
  });
const invalidate = (instruction: TransferInstruction) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const now = yield* Clock.currentTimeMillis;
    yield* store.run(
      "UPDATE financial_snapshots SET invalidated_at=MAX(invalidated_at,?) WHERE bank_id IN (?,?)",
      now,
      instruction.sender.bank_id,
      instruction.recipient.bank_id,
    );
  });
const saveProof = (
  original: Effect.Effect.Success<ReturnType<typeof loadOriginal>>,
  receipt: TransferReceipt,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* store.run(
      "UPDATE commands SET status='posted',core_id=?,error=NULL WHERE id=? AND status IN ('executing','uncertain')",
      receipt.transfer_id,
      original.command.id,
    );
    yield* store.run(
      "UPDATE customer_transfers SET receipt_json=? WHERE command_id=? AND receipt_json IS NULL",
      JSON.stringify(receipt),
      original.command.id,
    );
    yield* invalidate(original.instruction);
    return observedOutcome(original, "posted", receipt);
  });

export const inspectCustomerTransfer = (session: Session, id: string) =>
  Effect.gen(function* () {
    const original = yield* loadOriginal(session, id);
    const store = yield* Store;
    if (original.command.status === "rejected")
      return observedOutcome(original, "failed", null);
    if (
      original.command.status === "failed" ||
      original.command.status === "pending"
    )
      return observedOutcome(original, original.command.status, null);
    const transfer = yield* CustomerTransfers;
    const proof = yield* transfer
      .confirm(original.instruction)
      .pipe(Effect.either);
    if (proof._tag === "Right") return yield* saveProof(original, proof.right);
    if (original.command.status === "executing")
      yield* store.run(
        "UPDATE commands SET status='uncertain',error=? WHERE id=? AND status='executing'",
        proof.left.message,
        id,
      );
    return observedOutcome(original, "uncertain", null);
  });

export const confirmCustomerTransfer = (
  session: Session,
  offerId: string,
  key: string,
) =>
  Effect.gen(function* () {
    yield* customerOnly(session);
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(key))
      return yield* fail("A stable original idempotency key is required.", 400);
    const store = yield* Store;
    const sender = yield* sessionCustomer(session);
    const offer = yield* store.one<TransferOffer>(
      "SELECT * FROM customer_transfer_offers WHERE id=? AND bank_id=? AND sender_id=?",
      offerId,
      session.bank_id,
      sender.id,
    );
    if (!offer)
      return yield* fail(
        "Review a transfer for the selected customer first.",
        404,
      );
    const existing = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? AND key=?",
      session.bank_id,
      key,
    );
    if (existing) {
      const binding = yield* store.one<TransferRow>(
        "SELECT * FROM customer_transfers WHERE command_id=? AND offer_id=?",
        existing.id,
        offerId,
      );
      if (!binding)
        return yield* fail(
          "This key already belongs to a different instruction.",
        );
      // Inspect only: an interrupted or uncertain request must never dispatch again.
      return yield* inspectCustomerTransfer(session, existing.id);
    }
    const now = yield* Clock.currentTimeMillis;
    const policy = yield* Effect.gen(function* () {
      const payee = yield* activePayee(sender.id, offer.recipient_id);
      if (payee.id !== offer.payee_id || payee.version !== offer.payee_version)
        return yield* fail(
          "The saved payee changed. Review the transfer again.",
        );
      if (offer.expires_at < now || offer.payment_date !== bankingDate(now))
        return yield* fail(
          "The review expired. Review current funds and recipient again.",
        );
    }).pipe(Effect.either);
    const id = crypto.randomUUID();
    const payload = JSON.stringify({ customerOfferId: offer.id });
    yield* store.run(
      "INSERT INTO commands(id,bank_id,key,kind,status,amount_minor,description,maker,account_id,payload) VALUES(?,?,?,'transfer','pending',?,?,'customer',?,?) ON CONFLICT(bank_id,key) DO NOTHING",
      id,
      session.bank_id,
      key,
      offer.amount_minor,
      `Registered customer transfer ${offer.id}`,
      sender.account_id,
      payload,
    );
    const command = yield* store.one<BankingCommand>(
      "SELECT * FROM commands WHERE bank_id=? AND key=?",
      session.bank_id,
      key,
    );
    if (!command || command.id !== id)
      return yield* fail(
        "Another confirmation started. Inspect the original instruction.",
      );
    const original = yield* loadOriginal(session, id);
    const decline = (message: string) =>
      store
        .run(
          "UPDATE commands SET status='failed',error=? WHERE id=? AND status='pending'",
          message,
          id,
        )
        .pipe(
          Effect.flatMap((changed) =>
            changed === 1
              ? Effect.succeed({
                  ...observedOutcome(original, "failed", null),
                  message,
                })
              : fail(
                  "The original command outcome could not be retired safely. Inspect the original before a new instruction.",
                ),
          ),
        );
    if (policy._tag === "Left") return yield* decline(policy.left.message);
    const claimed = yield* store
      .run(
        "UPDATE commands SET status='executing',approver='policy:registered-retail-transfer' WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM core_write_claims WHERE bank_id=? AND account_id=? AND status IN ('executing','uncertain'))",
        id,
        session.bank_id,
        sender.account_id,
      )
      .pipe(Effect.either);
    if (claimed._tag === "Left")
      return yield* decline(
        "Saved payee authorization changed before execution; no Core request was sent. Review the payee again.",
      );
    if (!claimed.right)
      return yield* decline(
        "An original Core write is unresolved. Inspect it before confirming this transfer.",
      );
    yield* invalidate(original.instruction);
    const transfer = yield* CustomerTransfers;
    const result = yield* transfer
      .dispatch(original.instruction)
      .pipe(Effect.either);
    if (result._tag === "Left") {
      const status = result.left.uncertain === false ? "failed" : "uncertain";
      yield* store.run(
        "UPDATE commands SET status=?,error=? WHERE id=? AND status='executing'",
        status,
        result.left.message,
        id,
      );
      return observedOutcome(original, status, null);
    }
    return yield* saveProof(original, result.right);
  });
