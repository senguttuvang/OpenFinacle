import { Effect, Schema } from "effect";
import type { PlanningHousehold } from "../../src/domain/planning";
import {
  initialPlanningState,
  PlanningError,
  PlanningState,
  type PlanningState as State,
  transitionPlanningState,
  validatePlanningState,
} from "../../src/domain/planning-state";

const key = (id: string) => `openfinacle-planning-v1:${id}`;
export const loadPlanningDevice = (h: PlanningHousehold) =>
  Effect.gen(function* () {
    const raw = yield* Effect.try({
      try: () => localStorage.getItem(key(h.id)),
      catch: () =>
        new PlanningError({
          message:
            "Device storage is unavailable. Enable storage before editing planning records.",
          status: 503,
        }),
    });
    if (raw === null) return initialPlanningState(h);
    const value = yield* Schema.decodeUnknown(Schema.parseJson(PlanningState))(
      raw,
    ).pipe(
      Effect.mapError(
        () =>
          new PlanningError({
            message:
              "Saved device planning data is unreadable. It has been preserved; no automatic reset was performed.",
            status: 400,
          }),
      ),
    );
    return yield* validatePlanningState(value, h.id);
  });
export const savePlanningDevice = (current: State, proposed: State) =>
  Effect.gen(function* () {
    const raw = yield* Effect.try({
      try: () => localStorage.getItem(key(current.household)),
      catch: () =>
        new PlanningError({
          message: "Cannot read device storage.",
          status: 503,
        }),
    });
    if (raw !== null) {
      const saved = yield* Schema.decodeUnknown(
        Schema.parseJson(PlanningState),
      )(raw).pipe(
        Effect.mapError(
          () =>
            new PlanningError({
              message:
                "Stored planning data cannot be verified; preserve it and reload.",
              status: 409,
            }),
        ),
      );
      if (saved.version !== current.version)
        return yield* Effect.fail(
          new PlanningError({
            message:
              "Another tab changed this household. Reload before saving.",
            status: 409,
          }),
        );
    }
    const next = yield* transitionPlanningState(current, proposed);
    yield* Effect.try({
      try: () =>
        localStorage.setItem(key(next.household), JSON.stringify(next)),
      catch: () =>
        new PlanningError({
          message:
            "Planning changes could not be saved. Storage may be full or disabled.",
          status: 503,
        }),
    });
    return next;
  });
