import { Effect } from "effect";
import { type Account, BankingError, type Session } from "../domain/banking";
import { Core, Store } from "../domain/ports";
import { audit, requireAccount, requiredBank } from "./workspace-context";
export const addBeneficiary = (session: Session, name: string) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Add beneficiaries as the customer.",
          status: 403,
        }),
      );
    const store = yield* Store;
    const core = yield* Core;
    const bank = yield* requiredBank(session);
    yield* requireAccount(bank);
    const account = yield* core.request<Account>(
      "GET",
      `savingsaccounts/${bank.recipient_account}`,
    );
    const id = crypto.randomUUID();
    yield* store.run(
      "INSERT OR IGNORE INTO beneficiaries(id,bank_id,name,account_id,account_no,status) VALUES(?,?,?,?,?,'pending')",
      id,
      bank.id,
      name.trim() || "Arjun Raman",
      account.id,
      account.accountNo,
    );
    yield* audit(
      bank.id,
      session.role,
      "Beneficiary added",
      "Pending simulated verification; transfers remain disabled until confirmation.",
    );
    return { id, status: "pending" };
  });

export const confirmBeneficiary = (
  session: Session,
  id: string,
  code: string,
) =>
  Effect.gen(function* () {
    if (session.role !== "customer")
      return yield* Effect.fail(
        new BankingError({
          message: "Confirm beneficiaries as the customer.",
          status: 403,
        }),
      );
    if (code !== "246810")
      return yield* Effect.fail(
        new BankingError({
          message: "Use the displayed demo verification code, 246810.",
          status: 400,
        }),
      );
    const store = yield* Store;
    const changed = yield* store.run(
      "UPDATE beneficiaries SET status='active' WHERE bank_id=? AND id=? AND status='pending'",
      session.bank_id,
      id,
    );
    if (!changed)
      return yield* Effect.fail(
        new BankingError({
          message: "Pending beneficiary not found.",
          status: 404,
        }),
      );
    yield* audit(
      session.bank_id,
      session.role,
      "Beneficiary activated",
      "Demo OTP confirmed. No real SMS was sent.",
    );
    return { status: "active" };
  });
