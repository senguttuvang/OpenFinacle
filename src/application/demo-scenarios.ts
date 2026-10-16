import { Clock, Effect } from "effect";
import {
  type Bank,
  BankingError,
  type CustomerJourney,
} from "../domain/banking";
import { Store } from "../domain/ports";
import { startBankWithJourney } from "./banking";
import { financialView } from "./financial-view";

export const scenarioBank = (journey: CustomerJourney) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const setting = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key=?",
      `demo_${journey}_bank`,
    );
    const bank = setting
      ? yield* store.one<Bank>(
          "SELECT * FROM banks WHERE id=? AND status='ready'",
          setting.value,
        )
      : null;
    if (!bank)
      return yield* Effect.fail(
        new BankingError({
          message:
            "The permanent demo scenario is not prepared. Please ask the operator to seed the demo; entry never creates accounts.",
          status: 503,
        }),
      );
    return bank;
  });

export const prepareScenario = (journey: CustomerJourney, restart = false) =>
  Effect.gen(function* () {
    const store = yield* Store;
    const owner = crypto.randomUUID();
    const now = yield* Clock.currentTimeMillis;
    const lease = yield* store.one<{ owner: string }>(
      "INSERT INTO demo_seed_lease(id,owner,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE demo_seed_lease.expires_at<? RETURNING owner",
      owner,
      now + 600000,
      now,
    );
    if (!lease)
      return yield* Effect.fail(
        new BankingError({
          message:
            "A demo preparation is already running. Check its status before starting another.",
          status: 409,
        }),
      );
    return yield* Effect.gen(function* () {
      const existing = yield* store.one<{ value: string }>(
        "SELECT value FROM settings WHERE key=?",
        `demo_${journey}_bank`,
      );
      const id =
        existing && !restart
          ? existing.value
          : yield* startBankWithJourney(journey);
      const bank = yield* store.one<Bank>(
        "SELECT * FROM banks WHERE id=? AND status='ready'",
        id,
      );
      if (!bank)
        return yield* Effect.fail(
          new BankingError({
            message:
              "The selected demo bank is not ready; no automatic replay is permitted.",
            status: 503,
          }),
        );
      yield* financialView(bank, true);
      yield* store.run(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        `demo_${journey}_bank`,
        id,
      );
      return { journey, prepared: true, restarted: restart };
    }).pipe(
      Effect.timeoutFail({
        duration: "5 minutes",
        onTimeout: () =>
          new BankingError({
            message:
              "Demo preparation timed out. Inspect partial setup before preparing another scenario.",
            status: 503,
            uncertain: true,
          }),
      }),
      Effect.ensuring(
        store
          .run("DELETE FROM demo_seed_lease WHERE id=1 AND owner=?", owner)
          .pipe(Effect.orDie),
      ),
    );
  });
