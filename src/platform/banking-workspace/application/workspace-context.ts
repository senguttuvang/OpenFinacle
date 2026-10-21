import { Effect } from "effect";
import { type Bank, BankingError, type Session } from "../domain/banking";
import { Store } from "../domain/ports";
export interface Created {
  resourceId: number;
  savingsId?: number;
}

export const audit = (
  bank: string,
  actor: string,
  action: string,
  detail: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    yield* store.run(
      "INSERT INTO audit(id,bank_id,actor,action,detail) VALUES(?,?,?,?,?)",
      crypto.randomUUID(),
      bank,
      actor,
      action,
      detail,
    );
  });

export const requiredBank = (session: Session) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const bank = yield* store.one<Bank>(
      "SELECT * FROM banks WHERE id=?",
      session.bank_id,
    );
    if (bank?.status !== "ready")
      return yield* Effect.fail(
        new BankingError({
          message: "This demo workspace is not ready. Start a new demo.",
          status: 409,
        }),
      );
    return bank;
  });

export const requireStaff = (session: Session) =>
  session.role === "customer"
    ? Effect.fail(
        new BankingError({ message: "A staff role is required.", status: 403 }),
      )
    : Effect.void;

export const requireAccount = (bank: Bank) =>
  bank.customer_account > 0
    ? Effect.succeed(bank.customer_account)
    : Effect.fail(
        new BankingError({
          message: "Open and approve your account first.",
          status: 409,
        }),
      );
