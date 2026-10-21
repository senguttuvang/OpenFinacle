import { Clock, Effect } from "effect";
import {
  BankingError,
  type Session,
} from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import { sessionCustomer } from "../../customers/application/customer-registry";
import type { SavedPayee } from "../domain/customer-payees";

const fail = (message: string, status = 409) =>
  Effect.fail(new BankingError({ message, status, uncertain: false }));
const ownerFor = (session: Session) =>
  session.role === "customer"
    ? sessionCustomer(session)
    : fail("Manage payees as the selected customer.", 403);

export const savedPayees = (session: Session) =>
  Effect.gen(function* () {
    const owner = yield* ownerFor(session);
    const store = yield* Store;
    const payees = yield* store.all<SavedPayee>(
      "SELECT p.id,p.recipient_id,r.reference,r.display_name,substr(r.account_no,-4) AS account_suffix FROM customer_payees p JOIN customers r ON r.id=p.recipient_id WHERE p.owner_id=? AND p.status='active' AND r.status='active' AND r.branch_id=? ORDER BY r.display_name,p.id",
      owner.id,
      owner.branch_id,
    );
    return { payees, count: payees.length, maximum: 50 };
  });

export const activePayee = (ownerId: string, recipientId: string) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const payee = yield* store.one<{ id: string; version: number }>(
      "SELECT p.id,p.version FROM customer_payees p JOIN customers s ON s.id=p.owner_id JOIN customers r ON r.id=p.recipient_id WHERE p.owner_id=? AND p.recipient_id=? AND p.status='active' AND s.status='active' AND r.status='active' AND s.branch_id=r.branch_id AND s.id<>r.id",
      ownerId,
      recipientId,
    );
    if (!payee)
      return yield* fail("Choose an active payee saved to this customer.");
    return payee;
  });

export const reviewPayee = (
  session: Session,
  holderName: string,
  accountNumber: string,
) =>
  Effect.gen(function* () {
    const owner = yield* ownerFor(session);
    const store = yield* Store;
    const recipient = yield* store.one<{
      id: string;
      display_name: string;
      account_no: string;
      reference: string;
    }>(
      "SELECT id,display_name,account_no,reference FROM customers WHERE lower(trim(display_name))=lower(trim(?)) AND account_no=? AND branch_id=? AND status='active' AND id<>?",
      holderName,
      accountNumber,
      owner.branch_id,
      owner.id,
    );
    if (!recipient)
      return yield* fail(
        "These details do not identify an eligible branch payee. Check both details with the recipient.",
        400,
      );
    const id = crypto.randomUUID();
    const expires = (yield* Clock.currentTimeMillis) + 600000;
    yield* store.run(
      "INSERT INTO customer_payee_reviews(id,owner_id,recipient_id,expires_at,status) VALUES(?,?,?,?,'open')",
      id,
      owner.id,
      recipient.id,
      expires,
    );
    return {
      review_id: id,
      expires_at: expires,
      display_name: recipient.display_name,
      reference: recipient.reference,
      account_suffix: recipient.account_no.slice(-4),
    };
  });

export const confirmPayee = (session: Session, reviewId: string) =>
  Effect.gen(function* () {
    const owner = yield* ownerFor(session);
    const store = yield* Store;
    const review = yield* store.one<{ status: string; expires_at: number }>(
      "SELECT status,expires_at FROM customer_payee_reviews WHERE id=? AND owner_id=?",
      reviewId,
      owner.id,
    );
    if (!review)
      return yield* fail("Review the known account details first.", 404);
    if (review.status === "open") {
      const now = yield* Clock.currentTimeMillis;
      if (review.expires_at < now)
        return yield* fail("Payee review expired. Check the details again.");
      yield* store
        .run(
          "UPDATE customer_payee_reviews SET status='confirmed' WHERE id=? AND owner_id=? AND status='open' AND expires_at>=?",
          reviewId,
          owner.id,
          now,
        )
        .pipe(
          Effect.mapError(
            () =>
              new BankingError({
                message:
                  "The payee changed or the demo safety limit was reached. Reload saved payees before continuing.",
                status: 409,
                uncertain: false,
              }),
          ),
        );
    }
    // A replay of a consumed review never reactivates a later removal.
    return yield* savedPayees(session);
  });

export const removePayee = (session: Session, payeeId: string) =>
  Effect.gen(function* () {
    const owner = yield* ownerFor(session);
    const store = yield* Store;
    const original = yield* store.one<{ id: string }>(
      "SELECT id FROM customer_payees WHERE id=? AND owner_id=?",
      payeeId,
      owner.id,
    );
    if (!original)
      return yield* fail("Saved payee not found for this customer.", 404);
    yield* store.run(
      "UPDATE customer_payees SET status='removed',version=version+1 WHERE id=? AND owner_id=? AND status='active'",
      payeeId,
      owner.id,
    );
    return yield* savedPayees(session);
  });
