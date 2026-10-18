import { Clock, Effect } from "effect";
import { type Account, type Bank, BankingError } from "../domain/banking";
import { Core, Store } from "../domain/ports";

interface FinancialView {
  account: Account | null;
  recipient: Account;
  employer: Account;
  syncedAt: number;
  stale: boolean;
}
export const financialView = (bank: Bank, refresh = false) =>
  Effect.gen(function* () {
    const store = yield* Store;
    if (!refresh) {
      const saved = yield* store.one<{
        payload: string;
        synced_at: number;
        invalidated_at: number;
      }>("SELECT * FROM financial_snapshots WHERE bank_id=?", bank.id);
      if (!saved)
        return yield* Effect.fail(
          new BankingError({
            message:
              "This demo's saved data has not been prepared. Please ask the operator to prepare the demo.",
            status: 503,
          }),
        );
      const value = yield* Effect.try({
        try: () =>
          JSON.parse(saved.payload) as Omit<
            FinancialView,
            "syncedAt" | "stale"
          >,
        catch: () =>
          new BankingError({
            message:
              "The saved banking view is unavailable. Ask the operator to refresh the demo data.",
            status: 503,
          }),
      });
      return {
        ...value,
        syncedAt: saved.synced_at,
        stale: saved.synced_at < saved.invalidated_at,
      };
    }
    const core = yield* Core;
    const syncedAt = yield* Clock.currentTimeMillis;
    const read = (id: number) =>
      core.request<Account>(
        "GET",
        `savingsaccounts/${id}?associations=transactions`,
      );
    const [account, recipient, employer] = yield* Effect.all(
      [
        bank.customer_account
          ? read(bank.customer_account)
          : Effect.succeed(null),
        read(bank.recipient_account),
        read(bank.employer_account),
      ],
      { concurrency: 3 },
    );
    const value = { account, recipient, employer };
    yield* store.run(
      "INSERT INTO financial_snapshots(bank_id,payload,synced_at,invalidated_at) VALUES(?,?,?,0) ON CONFLICT(bank_id) DO UPDATE SET payload=excluded.payload,synced_at=excluded.synced_at WHERE excluded.synced_at>=financial_snapshots.synced_at AND excluded.synced_at>=financial_snapshots.invalidated_at",
      bank.id,
      JSON.stringify(value),
      syncedAt,
    );
    const saved = yield* store.one<{
      synced_at: number;
      invalidated_at: number;
    }>(
      "SELECT synced_at,invalidated_at FROM financial_snapshots WHERE bank_id=?",
      bank.id,
    );
    return {
      ...value,
      syncedAt,
      stale:
        !saved ||
        saved.synced_at !== syncedAt ||
        saved.synced_at < saved.invalidated_at,
    };
  });
