import { Clock, Effect, Either, Schema } from "effect";
import { BankingError } from "../../banking-workspace/domain/banking";
import { Store } from "../../banking-workspace/domain/ports";
import {
  LoanCatalogue,
  type LoanCatalogueInventory,
  type LoanSetupStep,
} from "../domain/origination/loan-product";
import {
  LoanSetupCommand,
  type LoanSetupEvent,
  LoanSetupState,
  loanSetupNext,
  loanSetupPending,
  loanSetupStepId,
} from "../domain/origination/loan-setup";

const setting = "loan_setup_v1";
const fail = (message: string, status = 409, uncertain = false) =>
  new BankingError({ message, status, uncertain });
const empty: LoanSetupState = { version: 0, events: [] };
const read = () =>
  Effect.gen(function* () {
    const store = yield* Store;
    const row = yield* store.one<{ value: string }>(
      "SELECT value FROM settings WHERE key=?",
      setting,
    );
    if (!row) return { raw: null, state: empty };
    const state = yield* Schema.decodeUnknown(Schema.parseJson(LoanSetupState))(
      row.value,
    ).pipe(
      Effect.mapError(() =>
        fail(
          "The loan setup checkpoint is invalid. Inspect its persisted history; no create is permitted.",
          503,
        ),
      ),
    );
    // Validate the append-only protocol as well as the stored shape.
    const latest = new Map<string, LoanSetupEvent>();
    const confirmed = new Set<string>();
    let expectedStep = 0;
    const order = ["OF1002", "OF1003", "OF2003", "OF4002", "OF5002", "product"];
    let valid = state.version === state.events.length;
    for (const event of state.events) {
      const step = loanSetupStepId(event.step);
      const previous = latest.get(event.key);
      valid &&= step === order[expectedStep] && !confirmed.has(step);
      if (previous)
        valid &&=
          loanSetupStepId(previous.step) === step &&
          (previous.status === "executing" ||
            previous.status === "uncertain") &&
          event.status !== "executing" &&
          (previous.status !== "uncertain" || event.status === "confirmed");
      else
        valid &&=
          (event.status === "executing" || event.status === "confirmed") &&
          ![...latest.values()].some(
            (item) =>
              item.status === "executing" || item.status === "uncertain",
          );
      valid &&= (event.status === "confirmed") === (event.resource_id !== null);
      latest.set(event.key, event);
      if (event.status === "confirmed") {
        confirmed.add(step);
        expectedStep++;
      }
    }
    if (!valid)
      return yield* Effect.fail(
        fail(
          "The loan setup history violates its operation protocol. Inspect it before any create.",
          503,
        ),
      );
    return { raw: row.value, state };
  });
const append = (
  before: { raw: string | null; state: LoanSetupState },
  event: LoanSetupEvent,
) =>
  Effect.gen(function* () {
    if (before.state.events.length >= 120)
      return yield* Effect.fail(
        fail(
          "Loan setup history reached its review limit. Preserve and inspect it before continuing.",
        ),
      );
    const state: LoanSetupState = {
      version: before.state.version + 1,
      events: [...before.state.events, event],
    };
    const raw = JSON.stringify(state);
    const store = yield* Store;
    const changed =
      before.raw === null
        ? yield* store.run(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING",
            setting,
            raw,
          )
        : yield* store.run(
            "UPDATE settings SET value=? WHERE key=? AND value=?",
            raw,
            setting,
            before.raw,
          );
    if (changed !== 1)
      return yield* Effect.fail(
        fail(
          "Loan setup changed concurrently. Read the saved checkpoint; this request will not create a reference.",
        ),
      );
    return { raw, state };
  });
const reference = (inventory: LoanCatalogueInventory, step: LoanSetupStep) =>
  step.kind === "product"
    ? inventory.product_id
    : inventory.accounts[step.code];
const view = (state: LoanSetupState) => ({
  ...state,
  next: loanSetupNext(state),
  pending: loanSetupPending(state),
});
const inventoryFor = (state: LoanSetupState) =>
  Effect.gen(function* () {
    const inventory = yield* (yield* LoanCatalogue).inventory();
    if (
      state.events.some(
        (event) =>
          event.status === "confirmed" &&
          reference(inventory, event.step) !== event.resource_id,
      )
    )
      return yield* Effect.fail(
        fail(
          "A previously confirmed loan reference is missing or has changed identity. Preserve the checkpoint and inspect Core setup; no automatic repair is permitted.",
          503,
        ),
      );
    return inventory;
  });
export const loanSetupInventory = () =>
  read().pipe(Effect.flatMap(({ state }) => inventoryFor(state)));

// Saved status never wakes the Core or creates configuration.
export const loanSetupStatus = () =>
  read().pipe(Effect.map(({ state }) => view(state)));
export const inspectLoanSetup = () =>
  Effect.gen(function* () {
    const before = yield* read();
    const inventory = yield* inventoryFor(before.state);
    const pending = loanSetupPending(before.state);
    if (!pending) return { ...view(before.state), inventory };
    const resourceId = reference(inventory, pending.step);
    if (resourceId === null) return { ...view(before.state), inventory };
    const result = yield* append(before, {
      ...pending,
      status: "confirmed",
      resource_id: resourceId,
      at: yield* Clock.currentTimeMillis,
      message:
        "Exact reference identity and configuration verified by read-only inspection.",
    });
    return { ...view(result.state), inventory };
  });
export const advanceLoanSetup = (input: LoanSetupCommand) =>
  Effect.gen(function* () {
    const command = yield* Schema.decodeUnknown(LoanSetupCommand, {
      onExcessProperty: "error",
    })(input).pipe(
      Effect.mapError(() =>
        fail(
          "Use a supported setup step, original key and saved version.",
          400,
        ),
      ),
    );
    const before = yield* read();
    const previousIndex = before.state.events.findIndex(
      (event) => event.key === command.key,
    );
    const previous = before.state.events[previousIndex];
    if (previous) {
      if (
        loanSetupStepId(previous.step) !== loanSetupStepId(command.step) ||
        command.version !== previousIndex
      )
        return yield* Effect.fail(
          fail("This setup key belongs to a different original instruction."),
        );
      return view(before.state);
    }
    if (loanSetupPending(before.state))
      return yield* Effect.fail(
        fail(
          "The original loan setup result is unresolved. Inspect it read-only; absence does not permit another create.",
          409,
          true,
        ),
      );
    const next = loanSetupNext(before.state);
    if (
      command.version !== before.state.version ||
      next === null ||
      loanSetupStepId(next) !== loanSetupStepId(command.step)
    )
      return yield* Effect.fail(
        fail("Use the current saved version and next setup step."),
      );
    // Leave room for outcome and later reconciliation events before reserving.
    if (before.state.events.length > 117)
      return yield* Effect.fail(
        fail(
          "Loan setup history reached its review limit. Preserve and inspect it before continuing.",
        ),
      );
    const catalogue = yield* LoanCatalogue;
    const inventory = yield* inventoryFor(before.state);
    const existing = reference(inventory, command.step);
    const event: LoanSetupEvent = {
      step: command.step,
      key: command.key,
      status: existing === null ? "executing" : "confirmed",
      resource_id: existing,
      at: yield* Clock.currentTimeMillis,
      message:
        existing === null
          ? "Original step and core key durably reserved before creation."
          : "Existing exact reference verified without creation.",
    };
    const reserved = yield* append(before, event);
    if (existing !== null) return view(reserved.state);
    const outcome = yield* catalogue
      .execute(command.step, command.key)
      .pipe(Effect.either);
    const finished: LoanSetupEvent = Either.isRight(outcome)
      ? {
          ...event,
          status: "confirmed",
          resource_id: outcome.right,
          at: yield* Clock.currentTimeMillis,
          message:
            "Core reference identity and configuration verified after creation.",
        }
      : {
          ...event,
          status: outcome.left.uncertain ? "uncertain" : "failed",
          at: yield* Clock.currentTimeMillis,
          message: outcome.left.message,
        };
    const result = yield* append(reserved, finished).pipe(
      Effect.mapError(() =>
        fail(
          "The loan setup outcome could not be saved. Read and inspect the original checkpoint before any further create.",
          503,
          true,
        ),
      ),
    );
    return view(result.state);
  });
